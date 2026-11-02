#!/usr/bin/env python3
"""Minimal UTC incident-log classifier; Python standard library only."""
import json, re, sys
from collections import Counter
EVENTS = [
 ("audio_keepalive_timeout", r"audio-forwarding.*Ping Pong Monitor timeout"),
 ("audio_connected", r"audio-forwarding.*User .* connected"),
 ("call_check", r"CHECK_START_CALL"),
 ("call_start", r"START_CALL"),
 ("socket_duplicate", r"Duplicate socket"),
 ("control_socket_closed", r"user socket closed"),
 ("control_socket_established", r"established connection"),
 ("new_call", r"NEW CALL ID|started new call"),
]
def analyze(text):
    events=[]
    for line in text.splitlines():
        time=re.match(r"^(\w+\s+\d+\s+\d\d:\d\d:\d\d(?:\.\d+)?)",line)
        matches=[name for name,pattern in EVENTS if re.search(pattern,line)]
        # START_CALL is a substring of CHECK_START_CALL: do not double count.
        if "call_check" in matches and "call_start" in matches:
            matches.remove("call_start")
        for name in matches:
            events.append({"utc":time.group(1) if time else "unknown",
                           "type":name, "raw":line.strip()})
    return {"events":events,"counts":dict(Counter(e["type"] for e in events)),
            "limitations":["Only supplied log lines were parsed.",
            "A missing START_CALL does not establish that recording failed.",
            "Audio timeout does not prove the control connection dropped.",
            "VPN involvement is a hypothesis, not a finding."]}
if __name__=="__main__":
    if len(sys.argv)<2:
        print("Usage: python analyzer.py logfile",file=sys.stderr);sys.exit(2)
    with open(sys.argv[1],encoding="utf-8") as f: result=analyze(f.read())
    print(json.dumps(result,indent=2))
