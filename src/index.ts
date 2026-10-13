/**
 * sigrun-ext-codemode: the codemode factory (the loader contract).
 *
 * The sigrun extension-package contract (sigrun's src/harness/loader.ts):
 * the default export is a FACTORY TAKING NO ARGUMENTS, returning
 * `{ extension }`. The loader calls it synchronously at boot, before
 * `Harness.open` reads the registry.
 *
 * What the factory does, in order:
 *   1. Reads the MCP namespace snapshot ONCE (src/config.ts):
 *      `SIGRUN_MCP_CONFIG` → `~/.config/sigrun/mcp.json`; absent file →
 *      empty namespaces (the extension still ships its codemode tool +
 *      section); a bad file warns and installs un-namespaced.
 *   2. Builds the QuickJS sandbox with the pinned constructor options
 *      (timeoutMs 300_000 — pi-codemode's own default, restated so the
 *      contract does not drift; memoryLimitBytes 256 MiB — a real cap
 *      where the upstream default is unbounded wasm32).
 *   3. Wraps upstream's `createCodemodeExtension({ sandbox, namespaces })`
 *      with the companion notice section (src/extension.ts).
 *
 * Note on `timeoutMs` (verified against pi-codemode 1.2.0): the
 * CONSTRUCTOR timeout governs `sandbox.execute()`; the durable codemode
 * tool path (`sandbox.start()`) takes its deadline from the script's own
 * `// @options: {"timeout_ms": N}` line (no options line → no deadline:
 * the sandbox default does not apply there). The constructor cap is
 * still the right pin: it bounds every execution of the plain sandbox
 * surface and documents the intended ceiling.
 *
 * `quickjs-wasi` is a REAL dependency of this package, not a transitive
 * courtesy: pi-codemode's worker resolves `quickjs-wasi/quickjs.wasm`
 * from disk at the first script. A re-pinned or deduped-away transitive
 * copy strands the wasm file and the first codemode call fails at runtime
 * (500s in prod) — declaring it here pins the resolution to this
 * package's own tree.
 */

import { CodemodeSandbox } from "@earendil-works/pi-codemode";
import type { CodemodeSandboxBase } from "@earendil-works/pi-codemode/portable";
import type { CodemodeNamespace } from "@earendil-works/pi-durable/codemode";
import { loadNamespaces } from "./config.js";
import { createSigrunCodemodeExtension } from "./extension.js";
import type { Extension } from "@earendil-works/pi-durable";

/** Pinned per-execution wall-clock deadline (pi-codemode's default). */
export const CODEMODE_TIMEOUT_MS = 300_000;

/** Pinned QuickJS heap cap (256 MiB; upstream default is unbounded). */
export const CODEMODE_MEMORY_LIMIT_BYTES = 256 * 1024 * 1024;

/** What {@link createCodemodeWiring} returns (the loader contract). */
export interface CodemodeWiring {
	/** The extension to install into the harness registry. */
	readonly extension: Extension;
	/** The sandbox the extension runs scripts in (call `close()` on shutdown). */
	readonly sandbox: CodemodeSandboxBase;
	/** The factory-time namespace snapshot (empty without an mcp.json). */
	readonly namespaces: readonly CodemodeNamespace[];
	/**
	 * Close the sandbox: aborts in-flight executions and stops the worker
	 * machinery. Called by hosts on harness shutdown; a fresh factory builds
	 * a fresh sandbox, so a closed wiring is never reused.
	 */
	close(): Promise<void>;
}

/**
 * The codemode factory (the loader contract: no arguments; config resolves
 * from the package context). Each call builds a FRESH sandbox — one
 * wiring, one sandbox, no shared worker state across installs.
 */
export function createCodemodeWiring(): CodemodeWiring {
	const namespaces = loadNamespaces();
	const sandbox = new CodemodeSandbox({
		timeoutMs: CODEMODE_TIMEOUT_MS,
		memoryLimitBytes: CODEMODE_MEMORY_LIMIT_BYTES,
	});
	const extension = createSigrunCodemodeExtension({ sandbox, namespaces });
	return {
		extension,
		sandbox,
		namespaces,
		close: () => sandbox.close(),
	};
}

/**
 * The sigrun extension-package contract: the default export is a factory
 * taking no arguments, returning `{ extension }`.
 */
export default createCodemodeWiring satisfies () => CodemodeWiring;

export {
	CODEMODE_NOT_OFFERED_NOTICE,
	CODEMODE_NOTICE_SECTION_KEY,
	renderCodemodeNotice,
} from "./extension.js";
export {
	loadNamespaces,
	MCP_CONFIG_ENV,
	resolveMcpConfigPath,
	serverEnabled,
} from "./config.js";
export type { McpServerEntry } from "./config.js";