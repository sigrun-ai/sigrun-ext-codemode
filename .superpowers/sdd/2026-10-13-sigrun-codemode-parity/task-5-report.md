# Task 5 report — sigrun-ext-codemode

STATUS: complete. All plan steps 1–4 done; repo local (git init + main
only, no remote — the forgejo URL is not registered; not pushed per
dispatch).

## Commits (main)

- `da20735` skeleton + factory: namespace snapshot, pinned sandbox,
  upstream codemode extension + notice section
- `fd92961` e2e tests: read round-trip, store/load, fork as-of,
  partial-output error, details+live records, runaway deadline (last)
- `538f72e` notice section wiring + canary spec: installed-not-offered
  render (fixed: installation read from agent.extensions, not
  callable); boot smoke against the built dist
- README commit (this report's sibling)

## Test one-liner

`npm test`: 3 files, 10 tests, all green — read-via-script round trip,
store/load across calls, fork sees values as-of, failing script
partial-output error, details.calls + pi.live.nestedTools records,
runaway `while(true){}` ends at the 1s script deadline with the harness
healthy (LAST in file), canary `return 1+1` against the BUILT dist
(including a `require.resolve("quickjs-wasi/quickjs.wasm")` assertion),
notice-section offered/not-offered matrix, namespace-snapshot config
test, registration shape test. typecheck + build green.

## Verified facts this task confirmed (and one it corrected)

- `CodemodeSandbox({ timeoutMs: 300_000, memoryLimitBytes: 256 MiB })`:
  both constructor options, as briefed.
- **CORRECTION to the brief's implied model**: the constructor
  `timeoutMs` does NOT govern the durable codemode tool path. Verified
  in pi-codemode 1.2.0 `dist/runtime/execution.js`:
  `CodemodeSandboxBase.execute()` uses `options.timeoutMs ??
  this.timeoutMs`, but `start()` — the path `createCodemodeTool` uses —
  passes `options.timeoutMs ?? Number.POSITIVE_INFINITY`, where the
  only `timeoutMs` is the script's own `// @options: {"timeout_ms": N}`
  line (parsed by `parseCodemodeSource`, read in
  pi-durable's `CodemodeCall.execute`). So the runaway test sets the
  deadline via the script's options line (`timeout_ms: 1000`), and the
  test passes (ends at ~1s, error result `Script timed out`,
  next call healthy). Documented in the README ("The deadline") and the
  factory docblock. The constructor pin is still correct as the
  plain-`execute` surface's cap.
- `createCodemodeExtension({ sandbox, namespaces? })` requires
  `sandbox`; `CODEMODE_TOOL_NAME = "codemode"`, `callers: ["model"]`;
  `CodemodeNamespace` longest-prefix — all confirmed.
- `quickjs-wasi` resolves from this package's own tree
  (canary asserts it at runtime).

## Namespace ruler (decision, recorded in README + agreeing with mcp repo)

Kept `<server>/<tool>`; one namespace per enabled server with
`prefix: "<server>/"`. No renames; upstream grouping renders per server.

## Hidden-exposure derivation (the addendum)

sigrun-ext-mcp's parse is NOT importable here (different repo, not
npm-published), so the config SHAPES are duplicated in `src/config.ts`
with the derivations quoted in doc comments (rev-3 ruling accepts
this). Server-level `exposure`/`toolExposure` shapes + `enabled`/
`disabled` are parsed per the mcp repo's rules; a server resolving
FULLY hidden (server default `hidden` AND every override `hidden`) is
excluded from the snapshot (boot-log warned). Per-tool hidden tools
are excluded BY CONSTRUCTION: they never register in the mcp extension,
so they never appear in `agent.callable` for upstream's section to
group — nothing this package needs to (or can) filter.

## Warn-if-not-offered: mechanism choice

Read upstream's render first (pi-durable `dist/codemode/codemode.js`:
`section("codemode", input => codemodeSection(input.agent.callable
.filter(...), namespaces, budget))` — renders `undefined` with no
callable tools, no knowledge of the codemode tool's offered state).
Chose the COMPANION SECTION (`codemode_notice`) over
`wrapSection("codemode", …)`: both are reachable (pi-durable's
`resolveAgent` applies wraps across selected extensions), but the wrap
could only prepend text around upstream's render while the companion
keys the notice to exactly the not-offered condition and renders
`undefined` (no tag written) when offered — de-dup by construction.
Both sections register in the ONE extension this package installs, so
the pair travels together.

**A bug this caught**: the first render implementation read
installation from `agent.callable` — wrong set: `callable` holds only
tools-callable tools (`callers` includes `"tools"`), and `codemode`
registers `callers: ["model"]`, so the notice never fired. Corrected to
read `agent.extensions[*].tools` for installation and `agent.tools` for
the offer. The notice test (offered → nothing; removed via
`modelTools` → notice; re-offered → nothing) drove the fix.

## Tests: fail-first discipline note

The brief's priority was "commit the skeleton + factory + round-trip
tests green FIRST". The factory landed in commit 1 with the tests
landing in commit 2, so the formal red-then-green cycle was compressed
to red-in-editor: the first suite run was 7/8 (the fork test failed on
a real API fact — a direct `tool.execute()` outside a harness task has
no `ToolExecutionApi`; also `codemode` is not in `agent.callable`), and
the notice test's first run was red on the same callable-vs-installed
bug. Both failed for the right reasons (API truth, not test rot) and
were fixed by honest mechanisms.

## Concerns / for the controller

1. **The timeoutMs correction matters for the spec**: if the spec (or
   Task 6's prompt work) believes the constructor `timeoutMs: 300_000`
   bounds codemode script wall-clock in the durable path, it does not
   — only a script's own `@options timeout_ms` (or no deadline at all)
   does. The runaway protection Review Focus 2 asked for is therefore
   per-script opt-in, not host-enforced, on this upstream version.
   The runaway test proves the machinery works WHEN the script sets
   the deadline. If host-enforced is wanted, it needs an upstream
   change or a wrapper that injects a default `timeout_ms` into the
   source (a candidate follow-up).
2. The factory builds a fresh sandbox per wiring; `wiring.close()`
   must be called on shutdown (the loader contract has no uninstall
   hook — same lifecycle note as sigrun-ext-mcp's).
3. `models: true` (upstream default) is kept: scripts get
   `models.*` globals via internal `pi.codemode.*` tools. If sigrun
   wants them off, pass `models: false` in a later task — one flag.
4. Task 8 wiring: the canary (`test/canary.spec.ts`) is a plain vitest
   file against `../dist/index.js`; the image build should run
   `npm ci && npm run build && npx vitest run test/canary.spec.ts` (or
   import the factory from the installed package in a container smoke
   step).