# SignalDesk — Balto Technical Escalation Evidence Lab

An independent, educational technical-support investigation prototype based on a **provided fictionalized hiring exercise**. Not affiliated with Balto, Frontier or Northwind.

## What it does
- Distinguishes confirmed events from hypotheses.
- Parses websocket keepalive timeouts, call-stage transitions, and connection lifecycle events.
- Displays an incident timeline and investigation checklist.
- Documents how to investigate VPN/proxy/firewall issues without overclaiming root cause.

## Run
Open `index.html` in a browser, or `python -m http.server 8000` from this directory and visit localhost:8000.

## Run the log parser
`python analyzer.py sample.log`

## Important interpretation
Audio WebSocket ping/pong timeouts appear at 12:33:06, 13:48:39 and 16:12:38 UTC. Missing templates relate to the control connection. Correlation and root cause are not established from the excerpt. Speed test bandwidth does not establish websocket stability.

## Privacy and honesty
Only synthetic or exercise-provided data. Do not upload customer logs, confidential hiring materials, proprietary binaries, or credentials to a public repository.

## Deployment
This directory is a static deployment root (Vercel or GitHub Pages). No API keys required. This is not an actual integration with Balto.
