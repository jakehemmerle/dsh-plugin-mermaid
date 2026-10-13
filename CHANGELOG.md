# Changelog

All versions are SemVer. While this plugin is qualified only against prerelease DSH builds, versions carry a matching prerelease channel (see [RELEASING.md](RELEASING.md)).

## 0.0.2-alpha.1 - 2026-10-12

First tagged release. Qualified against **DSH 0.2.1-alpha.2** (the fleet store build) and unpatched **dsh-TUI 0.14.0**; full evidence trail in [TESTING.md](TESTING.md).

### Fixed

- Two identical mermaid fences (same code and theme) no longer share one SVG element id. The render cache returned the first render's markup with mermaid's render id stamped into the `<svg>`, so `url(#…)` references (arrow markers, per-id styles) of the second copy resolved into the first and broke when the first was disposed or hidden. Every injected diagram now gets a fresh document-unique id; nothing inside the SVG references the root id. (P-10; found by the new real-client regression, red commit `775aace` → fix `b9a4b1c`.)

### Added

- Spec-driven test system shipped with the plugin: SPEC.md properties P-01..P-11 with an independent DOM oracle, fast-check properties on the pure core and the shipped bundles, real-client Playwright campaigns on the fleet `dsh web`, streaming-settle and duplicate-id examples, dispose-restores-DOM property, DSH seam contract (C-01..C-06), dsh-TUI inertness suite, vendored rig + mock model, and a Nix flake with package/devShell/checks and a real-client `nix run .#e2e` app.
- SemVer release procedure (RELEASING.md).
