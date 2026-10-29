# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
