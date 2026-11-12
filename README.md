# nsh-camera

Photo capture, video recording and live preview for Native Shell apps.

Part of the Native Shell (NSH) capability set. Docs in `docs/`, CI on GitHub Actions, and a web status page on GitHub Pages at https://supernsh.github.io/camera/.

## Status

**API written, unverified.** The repo is a Rust crate (`crates/nsh-camera`) and a TypeScript package (`packages/nsh-camera`) with the same API and behavior. The layout mirrors SuperNSH/biometrics. No native camera backend is wired yet: every unwired link resolves `ERR_CAMERA_NOT_AVAILABLE`. This work is uncommitted, and nothing is verified until GitHub Actions runs on the next push. Read [docs/brief.md](docs/brief.md) for the planned approach and [docs/parity.md](docs/parity.md) for what is done.

## Planned approach

nokhwa on desktop. CameraX and AVFoundation behind one native trait per platform.

## Layout

- `Cargo.toml`: the workspace manifest.
- `crates/nsh-camera/`: the Rust crate, with its modules in `src/` and its tests in `tests/`.
- `packages/nsh-camera/`: the TypeScript package (`src/`, `tests/`, `App.tsx`, `nsh.json`, `tsconfig.json`).
- `docs/`: `brief.md`, `goals.md`, `decisions.md`, `parity.md`.
- `site/`: the static status page, published by `.github/workflows/pages.yml`.
- `.github/workflows/`: `ci.yml` compiles and tests the tree; `pages.yml` publishes the status page.

## Checks

GitHub Actions compiles and tests everything. `ci.yml` runs on every push to `master` and on pull requests:

- **format**: `cargo fmt --all -- --check`.
- **rust**: `cargo clippy -p nsh-camera --all-targets -- -D warnings`, then `cargo test -p nsh-camera --no-fail-fast`.
- **typescript**, with NSH v0.5.0: `nsh check`, then `nsh build` (a warning fails the job), then `nsh test`.

Nothing is built or tested on a developer's machine.

## Licence

MIT. See [LICENSE](LICENSE).

Repository: https://github.com/SuperNSH/camera
