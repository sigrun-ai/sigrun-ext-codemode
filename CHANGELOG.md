# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.4] - 2026-11-08

- CI: grant actions: read to the release workflow (the release-test skip lookup). No code change.

## [0.1.3] - 2026-11-07

## [0.2.1] - 2026-11-09

- CI: needs-core true (the settings rework added the `@sigrun/sigrun` file: dev dependency; the v0.2.0 tag's test job failed before publishing, so the version was never live).

## [0.2.0] - 2026-11-09

### Changed

- MCP namespaces now come from the `mcp.servers` published hook and refresh
  after settings writes; legacy `mcp.json` reading is removed.
- peer pi-durable/pi-ai/chord ~1.5.0 (requires sigrun 0.11.0).

## [0.1.1] - 2026-10-27
### Changed
- Re-released through CI trusted publishing; this version carries SLSA
  provenance. No functional change from 0.1.0.

## [Unreleased]
### Changed
- Forward-compatible with pi-durable 1.4.0 (widened peer range). No behaviour change.

## [0.1.0] - 2026-10-13
### Added
- Renamed to `@sigrun/ext-codemode` for the 0.1.0 release (repo stays
  `sigrun-ai/sigrun-ext-codemode`): published package metadata
  (`publishConfig` access/provenance), host modules moved to
  `peerDependencies` mirrored in `devDependencies` at exact `1.3.0`
  (`quickjs-wasi` remains the one runtime dependency), and a manifest
  hygiene check wired into `npm test`.
- sigrun loader-contract wrapper over pi-durable's `createCodemodeExtension`:
  a `CodemodeSandbox` pinned `timeoutMs: 300_000` / `memoryLimitBytes: 256 MiB`
  at construction, MCP-config-driven namespaces (`SIGRUN_MCP_CONFIG` →
  `~/.config/sigrun/mcp.json; snapshot semantics), and the installed-not-offered
  notice section.
- Boot canary (`scripts/canary.mjs`): wasm resolution + a real harness
  `return 1+1`, fail-loud exit 1 — the image entry pre-step.
