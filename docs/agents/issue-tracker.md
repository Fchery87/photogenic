# Issue tracker: Local Markdown

Issues and PRDs for this repo live as markdown files in `.scratch/`.

> Chosen because this repo currently has **no git remote**. Switch to GitHub/GitLab by
> replacing this file's contents with the corresponding seed and updating `AGENTS.md`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The PRD is `.scratch/<feature-slug>/PRD.md`
- Implementation issues are `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`
- Triage and completion state are recorded as a `Status:` line near the top of each issue file (see `triage-labels.md` for the active workflow statuses and terminal `done` status)
- Comments and conversation history append to the bottom of the file under a `## Comments` heading

## When a skill says "publish to the issue tracker"

Create a new file under `.scratch/<feature-slug>/` (creating the directory if needed).

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path or the issue number directly.
