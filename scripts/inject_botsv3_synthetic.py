"""
Injects synthetic BOTS v3 CloudTrail events into the botsv3 index via HEC.

ONLY needed if you don't have the real BOTS v3 dataset.
If you have the real BOTS v3 app installed, skip this script - the real data is richer.

Pattern mirrors the real BOTS v3 cryptomining spray signature:
- Attacker: IAM user web_admin, IP 139.198.18.205
- 10 AWS regions, ~50-60 RunInstances attempts each in a 13-min burst
- ~280 Client.InstanceLimitExceeded, ~185 Client.UnauthorizedOperation, ~104 Client.Unsupported
- 6 successful RunInstances (cover), plus benign autoscaling AssumedRole events

Usage:
    # From the argus/ directory:
    python scripts/inject_botsv3_synthetic.py

    # Override HEC endpoint and token:
    SPLUNK_HEC_URL=https://127.0.0.1:8088/services/collector/event \\
    SPLUNK_HEC_TOKEN=<your-token> \\
    python scripts/inject_botsv3_synthetic.py
"""

import json
import os
import random
import time
import urllib.request
import ssl

# Read from env (matches backend/.env); fall back to defaults for local Docker setup
HEC_URL = os.environ.get("SPLUNK_HEC_URL", "https://127.0.0.1:8088/services/collector/event")
HEC_TOKEN = os.environ.get("SPLUNK_HEC_TOKEN", "")

# Base time: 2018-08-20 09:16:00 UTC
ATTACK_BASE_TS = 1534755360

REGIONS = [
    "us-east-1", "us-east-2", "us-west-1", "us-west-2",
    "eu-west-1", "eu-central-1", "ap-northeast-1",
    "ap-southeast-1", "ap-southeast-2", "sa-east-1",
]

ERROR_CODES = (
    ["Client.InstanceLimitExceeded"] * 280 +
    ["Client.UnauthorizedOperation"] * 185 +
    ["Client.Unsupported"] * 104
)
random.shuffle(ERROR_CODES)

ATTACKER_IP = "139.198.18.205"
ATTACKER_KEY = "AKIAI44QH8DHBEXAMPLE"
ACCOUNT_ID = "012345678901"

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE


def send_batch(events: list[dict]) -> None:
    body = "\n".join(json.dumps(e) for e in events).encode()
    req = urllib.request.Request(
        HEC_URL,
        data=body,
        headers={"Authorization": f"Splunk {HEC_TOKEN}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, context=ctx) as resp:
        result = json.loads(resp.read())
        if result.get("text") != "Success":
            print("HEC error:", result)


def make_attack_event(region: str, error_code: str, offset_secs: int) -> dict:
    ts = ATTACK_BASE_TS + offset_secs
    raw = {
        "eventVersion": "1.05",
        "userIdentity": {
            "type": "IAMUser",
            "principalId": "AIDIODR4TAW7CSEXAMPLE",
            "arn": f"arn:aws:iam::{ACCOUNT_ID}:user/web_admin",
            "accountId": ACCOUNT_ID,
            "accessKeyId": ATTACKER_KEY,
            "userName": "web_admin",
        },
        "eventTime": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(ts)),
        "eventSource": "ec2.amazonaws.com",
        "eventName": "RunInstances",
        "awsRegion": region,
        "sourceIPAddress": ATTACKER_IP,
        "userAgent": "Boto3/1.7.50 Python/3.6.5",
        "errorCode": error_code,
        "errorMessage": f"{error_code}: You have exceeded your EC2 instance limit in this region.",
        "requestParameters": {
            "instanceType": "t2.medium",
            "instancesSet": {"items": [{"imageId": "ami-0b02efe5", "maxCount": 10, "minCount": 1}]},
            "monitoring": {"enabled": False},
        },
        "responseElements": None,
        "requestID": f"req-{random.randint(100000000, 999999999)}",
        "eventID": f"evt-{random.randint(100000000, 999999999)}",
        "eventType": "AwsApiCall",
    }
    return {"time": ts, "index": "botsv3", "sourcetype": "aws:cloudtrail", "source": f"aws:cloudtrail:{region}", "event": json.dumps(raw)}


def make_benign_event(offset_secs: int) -> dict:
    ts = ATTACK_BASE_TS + offset_secs
    region = random.choice(["us-east-1", "us-east-2"])
    raw = {
        "eventVersion": "1.05",
        "userIdentity": {
            "type": "AssumedRole",
            "principalId": f"AROAI3KUMKEXAMPLE:AutoScaling",
            "arn": f"arn:aws:sts::{ACCOUNT_ID}:assumed-role/AutoScalingRole/AutoScaling",
            "accountId": ACCOUNT_ID,
            "sessionContext": {"sessionIssuer": {"type": "Role", "userName": "AutoScalingRole"}},
        },
        "eventTime": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(ts)),
        "eventSource": "ec2.amazonaws.com",
        "eventName": "RunInstances",
        "awsRegion": region,
        "sourceIPAddress": "autoscaling.amazonaws.com",
        "userAgent": "autoscaling.amazonaws.com",
        "requestParameters": {
            "instanceType": "t2.micro",
            "instancesSet": {"items": [{"imageId": "ami-0b89e5f1", "maxCount": 1, "minCount": 1}]},
            "monitoring": {"enabled": True},
        },
        "responseElements": {
            "instancesSet": {"items": [{"instanceId": f"i-{random.randint(10000000, 99999999):08x}"}]}
        },
        "requestID": f"req-{random.randint(100000000, 999999999)}",
        "eventID": f"evt-{random.randint(100000000, 999999999)}",
        "eventType": "AwsApiCall",
    }
    return {"time": ts, "index": "botsv3", "sourcetype": "aws:cloudtrail", "source": f"aws:cloudtrail:{region}", "event": json.dumps(raw)}


def main() -> None:
    if not HEC_TOKEN:
        print("ERROR: SPLUNK_HEC_TOKEN is not set. Set it in your environment or backend/.env.")
        print("       Example: SPLUNK_HEC_TOKEN=<token> python scripts/inject_botsv3_synthetic.py")
        raise SystemExit(1)

    print(f"Injecting synthetic BOTS v3 events -> {HEC_URL}")
    events = []

    # Attack burst: ~570 events across 10 regions over 13 minutes (780 seconds)
    error_idx = 0
    for region in REGIONS:
        count = random.randint(50, 60)
        for _ in range(count):
            offset = random.randint(0, 780)
            err = ERROR_CODES[error_idx % len(ERROR_CODES)]
            error_idx += 1
            events.append(make_attack_event(region, err, offset))

    # 6 successful RunInstances (cover)
    for _ in range(6):
        events.append(make_attack_event(random.choice(REGIONS), "", random.randint(0, 780)))

    # Benign baseline: ~120 autoscaling events spread over 24 hours before/during/after attack
    for i in range(120):
        offset = random.randint(-43200, 43200)  # +/- 12 hours
        events.append(make_benign_event(offset))

    random.shuffle(events)

    # Send in batches of 50
    batch_size = 50
    total = 0
    for i in range(0, len(events), batch_size):
        batch = events[i:i + batch_size]
        send_batch(batch)
        total += len(batch)
        print(f"  Sent {total}/{len(events)} events...")

    print(f"\nDone. Injected {len(events)} synthetic BOTS v3 events into botsv3 index.")
    print("Wait ~30s for indexing, then run: search index=botsv3 | stats count")


if __name__ == "__main__":
    main()
