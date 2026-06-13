"""Scenario specs for the Adversarial Detection Evolution Engine.

The engine is scenario-AGNOSTIC: a Scenario carries everything attack-specific - the sourcetype, the
Blue gen-0 baseline detection, the benign FP scope, how to query real field distributions, how to
build a synthetic event, and the Red briefing. Adding a new attack family = adding a Scenario; no
engine code changes. Two are shipped here (both on BOTS v3 CloudTrail, the cleanly-extracted data):
AWS cryptomining (resource hijacking) and AWS IAM account-persistence.

Evaluation contract: a detection SPL contains the token ``{src}`` (where the Evaluator injects the
data scope) and ends by emitting ``entity`` (the flagged actor) + ``detect_time``.
"""
from __future__ import annotations

import hashlib
import random
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable


@dataclass
class Scenario:
    key: str
    name: str
    technique: str
    mitre: list[str]
    mitre_names: dict[str, str]
    source_index: str
    sandbox_index: str
    sourcetype: str
    base_filter: str                 # SPL fragment selecting this attack's events (e.g. eventName=...)
    baseline_name: str
    baseline_spl: str                # gen-0 Blue rule; uses {src}; emits entity, detect_time
    benign_scope: str                # SPL fragment selecting real benign events (for FP measurement)
    evasion_dimensions: list[str]
    red_brief: str                   # describes the attack + the params Red must return
    base_epoch: float
    real_attack_scope: str           # SPL fragment selecting the REAL attack in the data ("" = n/a)
    distributions: Callable[[Any, "Scenario"], Awaitable[dict[str, Any]]]
    build_event: Callable[[dict, dict, random.Random], dict[str, Any]]


def stable_akid(uname: str) -> str:
    return "AKIA" + hashlib.md5(uname.encode()).hexdigest()[:12].upper()


# --------------------------------------------------------------------------------------------------
# Shared: live distribution query (regions / instance types / source IPs) for CloudTrail scenarios.
# --------------------------------------------------------------------------------------------------
async def _cloudtrail_distributions(search, scenario: Scenario) -> dict[str, Any]:
    idx, st = scenario.source_index, scenario.sourcetype

    async def vals(spl: str, key: str) -> list[str]:
        rows = await search.run_search(spl, earliest="0")
        return [r[key] for r in rows if r.get(key)]

    regions = await vals(
        f"search index={idx} sourcetype={st} {scenario.base_filter} earliest=0 "
        f"| stats count by awsRegion | sort -count | head 20", "awsRegion")
    ips = await vals(
        f"search index={idx} sourcetype={st} earliest=0 "
        f"| stats count by sourceIPAddress | sort -count | head 30", "sourceIPAddress")
    itypes = await vals(
        f"search index={idx} sourcetype={st} eventName=RunInstances earliest=0 "
        f"| stats count by requestParameters.instanceType | head 20",
        "requestParameters.instanceType")
    return {
        "regions": regions or ["us-east-1", "us-west-2", "eu-west-1"],
        "instance_types": itypes or ["t2.medium"],
        "source_ips": [ip for ip in ips if ip and not ip.endswith("amazonaws.com")] or ["139.198.18.205"],
    }


def _common_identity(params: dict, picks: dict) -> dict[str, Any]:
    uname = picks["uname"]
    identity: dict[str, Any] = {"type": params["identity_type"], "accessKeyId": stable_akid(uname)}
    if params["identity_type"] == "AssumedRole":
        identity["arn"] = f"arn:aws:sts::622676721278:assumed-role/{uname}/{uname}"
        identity["sessionContext"] = {"sessionIssuer": {"userName": uname}}
    else:
        identity["userName"] = uname
        identity["arn"] = f"arn:aws:iam::622676721278:user/{uname}"
    return identity


# --------------------------------------------------------------------------------------------------
# Scenario 1: AWS cryptomining spray (Resource Hijacking)
# --------------------------------------------------------------------------------------------------
def _crypto_build_event(params: dict, picks: dict, rng: random.Random) -> dict[str, Any]:
    denied = rng.random() > params["success_ratio"]
    event: dict[str, Any] = {
        "eventName": "RunInstances",
        "eventSource": "ec2.amazonaws.com",
        "awsRegion": picks["region"],
        "sourceIPAddress": picks["ip"],
        "userIdentity": _common_identity(params, picks),
        "requestParameters": {"instanceType": params.get("instance_type", "t2.medium"),
                              "instancesSet": {"items": [{"minCount": 1, "maxCount": 1}]}},
    }
    if denied:
        event["errorCode"] = rng.choice(["Client.UnauthorizedOperation", "Client.InstanceLimitExceeded"])
    return event


CRYPTO_BASELINE = (
    "{src} eventName=RunInstances userIdentity.type=IAMUser\n"
    "| bin _time span=1h\n"
    "| stats count as launches min(_time) as detect_time by _time userIdentity.userName\n"
    "| where launches > 20\n"
    "| eval entity='userIdentity.userName'\n"
    "| table entity detect_time launches"
)

AWS_CRYPTOMINING = Scenario(
    key="aws_cryptomining",
    name="AWS cryptomining spray via compromised IAM credentials",
    technique="Resource Hijacking via valid cloud accounts",
    mitre=["T1496", "T1078", "T1535"],
    mitre_names={"T1496": "Resource Hijacking", "T1078": "Valid Accounts",
                 "T1535": "Unused/Unsupported Cloud Regions"},
    source_index="botsv3", sandbox_index="argus_sandbox", sourcetype="aws:cloudtrail",
    base_filter="eventName=RunInstances",
    baseline_name="Abnormally High AWS RunInstances by User (ESCU-based, raw CloudTrail)",
    baseline_spl=CRYPTO_BASELINE,
    benign_scope="userIdentity.type=AssumedRole",
    evasion_dimensions=[
        "throttle the launch rate so per-hour counts stay under the threshold",
        "rotate the IAM username across many accounts", "mimic an AssumedRole / service identity",
        "spread launches across many regions", "rotate the sourceIPAddress",
        "mix successful and denied attempts",
    ],
    red_brief=("Goal: launch many EC2 instances (cryptomining) while evading the detection. Per "
               "variant provide: identity_type (IAMUser|AssumedRole), usernames[], source_ips[], "
               "regions[], instance_type, total_events, window_minutes, success_ratio, mitre[]."),
    base_epoch=datetime(2018, 8, 20, 9, 0, tzinfo=timezone.utc).timestamp(),
    real_attack_scope='userIdentity.userName="web_admin"',  # the real BOTS v3 cryptomining attacker
    distributions=_cloudtrail_distributions, build_event=_crypto_build_event,
)


# --------------------------------------------------------------------------------------------------
# Scenario 2: AWS IAM account-persistence (Create Account / Account Manipulation)
# --------------------------------------------------------------------------------------------------
IAM_ACTIONS = ["CreateUser", "CreateAccessKey", "AttachUserPolicy", "CreateLoginProfile", "PutUserPolicy"]


def _iam_build_event(params: dict, picks: dict, rng: random.Random) -> dict[str, Any]:
    action = picks["seq_action"]
    denied = rng.random() > params["success_ratio"]
    target = (params.get("target_users") or [picks["uname"] + "-svc"])[picks["i"] % max(1, len(params.get("target_users") or [1]))]
    event: dict[str, Any] = {
        "eventName": action,
        "eventSource": "iam.amazonaws.com",
        "awsRegion": "us-east-1",
        "sourceIPAddress": picks["ip"],
        "userIdentity": _common_identity(params, picks),
        "requestParameters": {"userName": target},
    }
    if denied:
        event["errorCode"] = rng.choice(["AccessDenied", "EntityAlreadyExists"])
    return event


IAM_BASELINE = (
    "{src} (eventName=CreateUser OR eventName=CreateAccessKey OR eventName=AttachUserPolicy "
    "OR eventName=CreateLoginProfile OR eventName=PutUserPolicy)\n"
    "| bin _time span=1h\n"
    "| stats count as iam_changes min(_time) as detect_time by _time userIdentity.userName\n"
    "| where iam_changes > 10\n"
    "| eval entity='userIdentity.userName'\n"
    "| table entity detect_time iam_changes"
)

AWS_IAM_PERSISTENCE = Scenario(
    key="aws_iam_persistence",
    name="AWS IAM account-persistence via compromised credentials",
    technique="Persistence via account creation & manipulation",
    mitre=["T1136", "T1098", "T1078"],
    mitre_names={"T1136": "Create Account", "T1098": "Account Manipulation", "T1078": "Valid Accounts"},
    source_index="botsv3", sandbox_index="argus_sandbox", sourcetype="aws:cloudtrail",
    base_filter=("(eventName=CreateUser OR eventName=CreateAccessKey OR eventName=AttachUserPolicy "
                 "OR eventName=CreateLoginProfile OR eventName=PutUserPolicy)"),
    baseline_name="Spike in IAM Account-Mutation Events by User (raw CloudTrail)",
    baseline_spl=IAM_BASELINE,
    benign_scope="userIdentity.type=AssumedRole",
    evasion_dimensions=[
        "throttle IAM changes so per-hour counts stay low", "rotate the acting username",
        "mimic an AssumedRole / automation identity", "rotate the sourceIPAddress",
        "interleave benign-looking IAM actions", "mix successful and denied attempts",
    ],
    red_brief=("Goal: establish persistence by creating IAM users/keys/policies while evading the "
               "detection. Per variant provide: identity_type (IAMUser|AssumedRole), usernames[] "
               "(the acting principals), source_ips[], target_users[] (principals being created), "
               "iam_actions[] (subset of CreateUser/CreateAccessKey/AttachUserPolicy/CreateLoginProfile/"
               "PutUserPolicy), total_events, window_minutes, success_ratio, mitre[]."),
    base_epoch=datetime(2018, 8, 20, 9, 0, tzinfo=timezone.utc).timestamp(),
    real_attack_scope="",  # BOTS v3 has too few real IAM-persistence events to validate against
    distributions=_cloudtrail_distributions, build_event=_iam_build_event,
)


SCENARIOS: dict[str, Scenario] = {s.key: s for s in (AWS_CRYPTOMINING, AWS_IAM_PERSISTENCE)}
DEFAULT_SCENARIO = AWS_CRYPTOMINING.key
