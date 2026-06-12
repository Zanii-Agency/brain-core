# @sinanagency/brain-core

The shared brain engine every sinanagency bot calls. Empty machinery — same shape as `@sinanagency/bot-guards`, one layer up.

**Status:** v0.1 spec phase. Code extraction from Sasa pending.

## What it is

```
INPUT (text · voice · doc · image · reaction · quote · @mention)
    │
    ▼
[ Intake ]            ← @sinanagency/intake (separate package)
    │
    ▼
[ Brain Core ]        ← THIS PACKAGE
    │  model client · tool dispatch · honesty guards
    │  completion guards · prompt cache split · persona scaffold
    ▼
[ Wall ]              ← @sinanagency/bot-guards (already shipped)
    │  sanitizeReply at the primitive
    ▼
OUTPUT
```

## What lives here

- `runBrain()` — the engine. Takes config + history + command, returns reply + toolsRan.
- Anthropic client wrapper (Sonnet 4.6 default, Opus 4.8 opt-in per call, Haiku 4.5 for router).
- Tool dispatch loop (`tool_use` + `tool_result` round-trip).
- Honesty guards (anti-fake-completion, anti-fake-staging, anti-hedge-loop, anti-fabrication).
- Prompt cache split (static prefix cached across turns).
- Persona scaffold (`buildSystem` template, slots for per-bot persona).

## What does NOT live here

- Bot persona text (lives in Adapter)
- Tool implementations (lives in Adapter — catalog is the contract)
- Database calls (lives in Adapter)
- Doctrine / laws (lives in each project's CLAUDE.md)
- Anything tenant-shaped

## Distribution

Same pattern as bot-guards: source-of-truth here, `sync.sh` copies dist to each project's `lib/brain-core/`. NPM publish deferred until 5+ consumers.

## The Catalog

[TOOL_CATALOG.md](./TOOL_CATALOG.md) — every tool any bot could pick.

## Versioning

- Bumping minor (`0.1 → 0.2`) requires re-syncing all consuming projects.
- Bumping major requires Adapter migration in every project.
- Each project's `lib/brain-core/VERSION` stamps the exact git SHA deployed.
