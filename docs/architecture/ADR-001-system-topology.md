# ADR-001: System Topology and Storage

Date: 2026-08-07
Status: Accepted

## Context

Target machine: MacBook Air M4, Node v26.5.0, pnpm 11. No Docker, no local
PostgreSQL/Redis, no Homebrew. GitHub CLI auth currently invalid. Available
provider keys in environment: OpenAI, Gemini, Groq (no Anthropic, no Telegram
token at build time).

The platform requires durable 24/7 execution: persisted tasks, durable queue,
survivable restarts, scheduled workflows.

## Decisions

1. **TypeScript pnpm monorepo.** Apps: `web` (Next.js dashboard + REST API),
   `worker` (long-running Node process: queue consumer, scheduler, Telegram
   bot). Packages: `shared` (contracts), `core` (pure domain logic), `db`
   (Drizzle schema + repositories), `ai-gateway` (provider-agnostic routing).

2. **SQLite via Drizzle ORM (WAL mode)** for local/dev persistence.
   Rationale: no container runtime or Postgres available on this machine;
   SQLite is durable, transactional, zero-ops. Schema is written
   Postgres-compatible (explicit types, no SQLite-only features in domain
   columns) so production can move to managed PostgreSQL by swapping the
   driver and regenerating migrations. Documented in docs/operations.

3. **SQLite-backed durable queue** instead of Redis/BullMQ. Jobs are rows
   with transactional claim (`UPDATE ... WHERE` inside immediate
   transactions), leases with expiry, heartbeats, bounded retries with
   exponential backoff, and dead-letter state. The queue interface is
   isolated so a Redis-backed implementation can replace it without touching
   the worker logic.

4. **First-party auth**: scrypt-hashed passwords, httpOnly secure session
   cookies, server-side session table with revocation, login rate limiting.
   Single-owner deployment; roles/permissions table present for future
   members.

5. **AI gateway over raw REST (fetch)** for OpenAI, Gemini, Groq, Anthropic
   adapters plus a deterministic `mock` provider for tests/dev. No provider
   SDK dependency: avoids version drift and keeps the router testable.
   Circuit breaker, fallback chains, per-provider budgets, usage tracking.

6. **Telegram via grammY long-polling** inside the worker. No public URL
   required. Bot is disabled unless `TELEGRAM_BOT_TOKEN` is configured;
   chat allowlist enforced.

7. **Real-time dashboard updates via SSE** from the web app, fed by the
   event/audit tables (polling fallback). Simpler and more proxy-friendly
   than WebSockets for this deployment.

8. **Deployment**: Dockerfiles + docker-compose (with PostgreSQL profile for
   production) + GitHub Actions CI. Actual cloud deployment is blocked on
   credentials (Vercel/Railway/Fly + GitHub re-auth) and is reported as a
   handoff item, not silently skipped.

## Consequences

- Single-node SQLite means web and worker must run on the same host (or a
  shared volume) until the Postgres migration. Acceptable for the current
  24/7 single-server target.
- No multi-node horizontal scaling until queue/DB swap. Documented.
