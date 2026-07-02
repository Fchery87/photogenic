# AGENTS.md

Project guidance for AI coding agents working in this repo.

## Agent skills

### Issue tracker

Issues and PRDs are tracked as **local markdown** files under `.scratch/<feature>/` (no git remote configured; external PRs are not a triage surface). See `docs/agents/issue-tracker.md`.

### Triage labels

Uses the **canonical** five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`), recorded on each issue's `Status:` line. See `docs/agents/triage-labels.md`.

### Domain docs

**Single-context** layout — one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
