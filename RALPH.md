# Ralph loop state

Effort epic: `mmd-bwo` (3 rounds). Read this file and `bd ready` at the start of every round.

## Round 1 (2026-10-11)

- Done: beads initialised (prefix mmd); step beads mmd-bwo.1..9, bug mmd-bwo.10 (duplicate SVG id).
- mmd-bwo.1 closed: main == nix-config pin ca1202b.

## Gotchas

- `bd init` auto-commits and installs Claude/Codex/Cursor hooks and sets `core.hooksPath=.beads/hooks`; that commit was undone and the integrations removed. Don't rerun `bd init`.
