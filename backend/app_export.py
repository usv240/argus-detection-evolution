"""Packages an ARGUS-evolved detection as an installable Splunk app (.spl).

A .spl file is just a gzip tarball of a Splunk app directory:

    <app_id>/
      default/app.conf
      default/savedsearches.conf
      metadata/default.meta
      README.md
      ARGUS_CERTIFICATE.json   (if a certificate was supplied)
      APPINSPECT_REPORT.json   (if splunk-appinspect ran successfully)

Every export is validated automatically with Splunk's official AppInspect CLI:

    splunk-appinspect inspect <app_id>.spl --mode test --data-format json

The saved search ships disabled (disabled=1, enableSched=0) - an operator must review the
ARGUS-evolved SPL and explicitly enable it. This mirrors the Approve/Edit/Reject gate in the UI:
nothing ARGUS produces is auto-deployed.
"""
from __future__ import annotations

import io
import json
import os
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
from pathlib import Path
from typing import Any

from scenarios import Scenario


def _app_id(scenario: Scenario) -> str:
    slug = re.sub(r"[^a-z0-9_]+", "_", scenario.key.lower()).strip("_")
    return f"argus_{slug}_evolved"


def _real_src(scenario: Scenario) -> str:
    return f"index={scenario.source_index} sourcetype={scenario.sourcetype}"


def _oneline_spl(spl: str) -> str:
    """Collapse the multi-line SPL onto one line - SPL is whitespace-insensitive between
    pipes/clauses, and a single line avoids .conf line-continuation edge cases entirely."""
    return " ".join(spl.split())


def _pack_tarball(files: dict[str, bytes]) -> bytes:
    """Gzip-tar a {path: bytes} map into a Splunk-app-shaped .spl blob."""
    buf = io.BytesIO()
    now = int(time.time())
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for path, data in files.items():
            info = tarfile.TarInfo(name=path)
            info.size = len(data)
            info.mtime = now
            info.mode = 0o644
            tar.addfile(info, io.BytesIO(data))
    buf.seek(0)
    return buf.getvalue()


def _appinspect_executable() -> str | None:
    """Locate the `splunk-appinspect` CLI, if installed. Checks PATH, then the directory
    of the running interpreter (covers venvs where Scripts/bin isn't on PATH)."""
    found = shutil.which("splunk-appinspect")
    if found:
        return found
    candidate = Path(sys.executable).parent / (
        "splunk-appinspect.exe" if os.name == "nt" else "splunk-appinspect"
    )
    return str(candidate) if candidate.exists() else None


def run_appinspect(app_id: str, blob: bytes) -> dict[str, Any]:
    """Run Splunk's official `splunk-appinspect` CLI against a built .spl bundle.

    Best-effort and side-effect-free for the caller: returns
    {"available": False, "reason": ...} if the CLI is missing or the run fails for any
    reason. AppInspect is a bonus validation signal, never a blocker for export - 
    `available: false` is reported honestly rather than faking a "pass".
    """
    exe = _appinspect_executable()
    if not exe:
        return {"available": False, "reason": "splunk-appinspect CLI not installed"}

    with tempfile.TemporaryDirectory(prefix="argus_appinspect_") as tmpdir:
        tmp_path = Path(tmpdir)
        app_path = tmp_path / f"{app_id}.spl"
        report_path = tmp_path / "report.json"
        app_path.write_bytes(blob)
        try:
            subprocess.run(
                [exe, "inspect", str(app_path), "--mode", "test",
                 "--data-format", "json", "--output-file", str(report_path),
                 "--log-level", "CRITICAL"],
                capture_output=True, timeout=120, check=False,
            )
            report = json.loads(report_path.read_text(encoding="utf-8"))
        except Exception as exc:  # noqa: BLE001 - best-effort bonus signal, never fatal
            return {"available": False, "reason": f"{type(exc).__name__}: {exc}"}

    summary = report.get("summary", {})
    errors = summary.get("error", 0)
    failures = summary.get("failure", 0)
    warnings = summary.get("warning", 0)
    if errors or failures:
        verdict = "fail"
    elif warnings:
        verdict = "warning"
    else:
        verdict = "pass"

    messages: list[dict[str, Any]] = []
    for rep in report.get("reports", []):
        for group in rep.get("groups", []):
            for check in group.get("checks", []):
                if check.get("result") not in ("error", "failure", "warning"):
                    continue
                for msg in check.get("messages") or [{}]:
                    messages.append({
                        "check": check.get("name"),
                        "result": check.get("result"),
                        "message": (msg.get("message") or "")[:300],
                    })

    return {
        "available": True,
        "verdict": verdict,
        "summary": summary,
        "messages": messages[:20],
    }


def build_app_bundle(scenario: Scenario, final_spl: str, run_id: str | None,
                      certificate: dict[str, Any] | None) -> tuple[str, bytes, dict[str, Any]]:
    """Returns (app_id, gzip-tarball bytes, appinspect_result).

    The bundle is built, validated with `splunk-appinspect`, and - if AppInspect ran
    successfully - repacked with an embedded `APPINSPECT_REPORT.json` so the downloaded
    app carries proof of its own validation.
    """
    app_id = _app_id(scenario)
    search_spl = _oneline_spl(final_spl.replace("{src}", _real_src(scenario)))
    saved_search_name = f"ARGUS Evolved - {scenario.name}"

    app_conf = (
        "[install]\n"
        "is_configured = 0\n"
        "state = enabled\n"
        "\n"
        "[ui]\n"
        "is_visible = 0\n"
        f"label = ARGUS Evolved Detection - {scenario.name}\n"
        "\n"
        "[launcher]\n"
        "author = ARGUS\n"
        f"description = Detection evolved by ARGUS (Adversarial Detection Evolution Engine) for "
        f"{scenario.technique}. MITRE ATT&CK: {', '.join(scenario.mitre)}. "
        f"Generated from run {run_id or 'unknown'}.\n"
        "version = 1.0.0\n"
        "\n"
        "[package]\n"
        f"id = {app_id}\n"
        "check_for_updates = false\n"
        "\n"
        "[id]\n"
        f"name = {app_id}\n"
        "version = 1.0.0\n"
    )

    description = (
        f"Auto-evolved by ARGUS run {run_id or 'unknown'}. Detects {scenario.technique} "
        f"(MITRE {', '.join(scenario.mitre)}). Hardened against synthetic evasion variants "
        f"scored live against Splunk. Ships disabled - review the SPL before enabling."
    )

    savedsearches_conf = (
        f"[{saved_search_name}]\n"
        f"search = {search_spl}\n"
        "dispatch.earliest_time = -24h\n"
        "dispatch.latest_time = now\n"
        "cron_schedule = 0 * * * *\n"
        "enableSched = 0\n"
        "disabled = 1\n"
        f"description = {description}\n"
    )

    default_meta = (
        "[]\n"
        "access = read : [ * ], write : [ admin, sc_admin ]\n"
        "export = system\n"
    )

    readme = (
        f"# {app_id}\n\n"
        "Generated by ARGUS - Adversarial Detection Evolution Engine.\n\n"
        f"- Scenario: {scenario.name}\n"
        f"- Technique: {scenario.technique}\n"
        f"- MITRE ATT&CK: {', '.join(scenario.mitre)}\n"
        f"- Run ID: {run_id or 'unknown'}\n"
        f"- Baseline detection: {scenario.baseline_name}\n\n"
        "## What's inside\n\n"
        "`default/savedsearches.conf` contains the ARGUS-evolved detection as a saved search,\n"
        "**disabled by default** (`disabled = 1`, `enableSched = 0`). Review the SPL, then set\n"
        "`disabled = 0` and `enableSched = 1` to schedule it.\n\n"
        "## Validated with Splunk AppInspect\n\n"
        "This bundle is checked automatically at export time with Splunk's official\n"
        "`splunk-appinspect` CLI. If the CLI was available at export time, the full JSON\n"
        "result ships alongside this file as `APPINSPECT_REPORT.json`. To re-run it yourself:\n\n"
        f"    splunk-appinspect inspect {app_id}.spl --mode test\n\n"
        "## Evolved SPL\n\n"
        "```\n"
        f"{final_spl.replace('{src}', _real_src(scenario))}\n"
        "```\n"
    )

    files: dict[str, bytes] = {
        f"{app_id}/default/app.conf": app_conf.encode("utf-8"),
        f"{app_id}/default/savedsearches.conf": savedsearches_conf.encode("utf-8"),
        f"{app_id}/metadata/default.meta": default_meta.encode("utf-8"),
        f"{app_id}/README.md": readme.encode("utf-8"),
    }
    if certificate:
        files[f"{app_id}/ARGUS_CERTIFICATE.json"] = json.dumps(
            certificate, indent=2, sort_keys=True).encode("utf-8")

    blob = _pack_tarball(files)
    appinspect = run_appinspect(app_id, blob)

    if appinspect.get("available"):
        files[f"{app_id}/APPINSPECT_REPORT.json"] = json.dumps(
            appinspect, indent=2, sort_keys=True).encode("utf-8")
        blob = _pack_tarball(files)

    return app_id, blob, appinspect
