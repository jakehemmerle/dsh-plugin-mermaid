# Agent instructions

- Work is tracked in the workspace Beads instance (`nx`, `~/ws/.beads`), label `project:dsh`.
  In the `~/ws/code/personal/<repo>` clone `bd` resolves there through `.beads/redirect`
  (written by `ws sync`); this repo has no Beads database of its own.
- Loop state and gotchas live in [RALPH.md](RALPH.md). Product properties are in [SPEC.md](SPEC.md); traceability and evidence in [TESTING.md](TESTING.md); releases follow [RELEASING.md](RELEASING.md).
- Commit directly to `main` as `jakehemmerle <jakehemmerle@protonmail.com>`; stage only your own paths.
- Tests never touch `~/.dsh`, `~/.dsh-tui`, port 3080 or the user's tmux server: use `test/rig/` (private HOME/DSH_HOME, port 0, private tmux socket, mock model).
