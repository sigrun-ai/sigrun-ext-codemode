# @sigrun/ext-codemode

The codemode extension for sigrun (pi-durable): the `codemode` tool —
model-written JavaScript run in a QuickJS sandbox, whose script survives
a restart — installed via upstream's
`createCodemodeExtension` (`@earendil-works/pi-durable/codemode`) with
sigrun's config and prompt additions.

The sigrun extension-package contract: the default export is a factory
taking the sigrun host, returning `{ extension }` and lifecycle handlers.

## What the factory does

1. Creates one live MCP namespace array from sigrun-ext-mcp's
   `mcp.servers` published hook. One `CodemodeNamespace` per enabled,
   visible server, `prefix: "<server>/"`. The first call starts without
   blocking the factory; committed settings writes and run settlement
   refresh the same array in place. A failed hook call warns once per
   failure status and preserves the last known namespaces.
2. Builds the QuickJS sandbox (`CodemodeSandbox` from
   `@earendil-works/pi-codemode`) with pinned constructor options:
   `timeoutMs: 300_000`, `memoryLimitBytes: 256 MiB`.
3. Wraps upstream's `createCodemodeExtension({ sandbox, namespaces })`
   with a companion `codemode_notice` section (below).

The hook supplies each server's resolved `enabled`, `exposure`, and
`toolExposure` values. A fully `hidden` server (server default `hidden`
and every override `hidden`) is excluded: hidden tools never register,
so nothing scripts can call remains. Per-tool `hidden` resolution is
sigrun-ext-mcp's job at registration time; these namespaces only group
by prefix, and hidden tools never reach `agent.callable` to be grouped.

### The deadline (verified against pi-codemode 1.2.0)

The sandbox constructor's `timeoutMs` governs the plain
`sandbox.execute()` surface. The durable codemode tool path
(`sandbox.start()`) takes its deadline from the script's own first line:

```js
// @options: {"timeout_ms": 60000}
while (true) {}
```

A script without an options line has NO deadline (the constructor cap
does not apply there) — models should be prompted to set one; sigrun's
system prompt carries that guidance. The pinned constructor options
still bound the plain sandbox surface and document the ceiling.

## The warn-if-not-offered section

Upstream's `codemode` section lists script-callable tools (grouped by
namespace) but does not know whether the `codemode` tool itself is
model-offered. When the extension is installed yet the tool is excluded
from a request's offered set (Settings → default tools), the companion
`codemode_notice` section renders:

> codemode scripts are available but the tool is not offered; enable it
> via Settings → default tools

When the tool is offered the section renders NOTHING (returns
`undefined`; no tag is written) — de-duplication with upstream's listing
by construction. Mechanism choice: a companion section rather than a
`wrapSection` on upstream's key — the wrap could only prepend text
around upstream's render, while the companion keys the notice to the
not-offered condition exactly and leaves the upstream render untouched.
Both sections are registered by the one extension this package installs,
so the pair always travels together.

## Tool naming: `<server>/<tool>` (decision, agreeing with sigrun-ext-mcp)

Tools keep the `<server>/<tool>` shape rather than upstream pi's
`mcp__<server>__<tool>`; the codemode namespaces use
`prefix: "<server>/"`, so upstream's longest-prefix grouping renders per
server with no renames. The same decision is recorded in
sigrun-ext-mcp's README; the two must stay consistent.

## Package replacement semantics (slice 4)

Replace this package by not installing it and installing yours: the
surface is one tool named exactly `codemode` (plus the companion
`codemode_notice` section and live MCP namespaces), so a
per-name replacement is trivial — uninstall ours, install the replacement
under the same tool name. Do NOT co-install: pi-durable resolves
cross-extension duplicate tool names last-selected-wins, so a co-installed
replacement silently shadows the original. Sigrun's extension loader now
makes the shadowing visible at boot (it `console.warn`s once per duplicate
tool name, naming the extensions and the last-wins resolution), but the
warning changes nothing: last-wins stands. Replace, don't co-install.

## Dependencies

`quickjs-wasi` is a REAL dependency of this package, not a transitive
courtesy: pi-codemode's worker resolves `quickjs-wasi/quickjs.wasm`
from disk at the first script. A re-pinned or deduped-away transitive
copy strands the wasm file, and the first codemode call fails at runtime
(in prod: a 500 on the first script). The canary test
(`test/canary.spec.ts`) asserts the wasm resolves and runs
`return 1 + 1` against the BUILT package — the same assertions Task 8
wires into the container image build.

## Development

```sh
npm install && npm test        # vitest run (includes the canary + the runaway test, last)
npm run typecheck
npm run build
```

The runaway-script test (`while (true) {}` with a 1s `timeout_ms`) is
the LAST test in `test/codemode.test.ts`, so a wall-clock death on it
still ships the rest of the suite.