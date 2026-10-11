# Agent instructions

- Work is tracked in **beads** (`bd`, prefix `mmd`). Run `bd ready` / `bd list` first; `bd prime` for the full workflow. Run `bd export -o .beads/issues.jsonl` before committing so the export is current. The Dolt database under `.beads/embeddeddolt/` is local-only.
- Loop state and gotchas live in [RALPH.md](RALPH.md). Product properties are in [SPEC.md](SPEC.md); traceability and evidence in [TESTING.md](TESTING.md); releases follow [RELEASING.md](RELEASING.md).
- Commit directly to `main` as `jakehemmerle <jakehemmerle@protonmail.com>`; stage only your own paths.
- Tests never touch `~/.dsh`, `~/.dsh-tui`, port 3080 or the user's tmux server: use `test/rig/` (private HOME/DSH_HOME, port 0, private tmux socket, mock model).
