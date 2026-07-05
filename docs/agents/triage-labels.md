# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual `Status:` strings used in this repo's local-markdown issue tracker, and also documents the terminal completion status used by completed issues.

## Active workflow statuses

| Label in mattpocock/skills | Status in our tracker | Meaning                                  |
| -------------------------- | --------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`        | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`          | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`     | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`     | Requires human implementation            |
| `wontfix`                  | `wontfix`             | Will not be actioned                     |

## Terminal completion status

| Status in our tracker | Meaning                      |
| --------------------- | ---------------------------- |
| `done`                | Work is implemented/finished |

When a skill mentions a canonical triage role (for example, "apply the AFK-ready triage label"), use the matching `Status:` string from the active workflow table above.

For the local-markdown tracker, these strings are written on the `Status:` line near the top of each issue file. Completed issues should use `Status: done`.
