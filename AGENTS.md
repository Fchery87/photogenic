# AGENTS.md

Project guidance for AI coding agents working in this repo.

## Agent skills

### Issue tracker

Issues and PRDs are tracked as **local markdown** files under `.scratch/<feature>/` (no git remote configured; external PRs are not a triage surface). See `docs/agents/issue-tracker.md`.

### Triage labels

Uses the local-markdown tracker `Status:` line for both triage and completion state. Active workflow statuses are `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`; completed work is recorded as `done`. See `docs/agents/triage-labels.md`.

### Domain docs

**Single-context** layout — one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
