/**
 * sigrun-ext-codemode: the codemode factory (the loader contract).
 *
 * The single MCP namespace is declared statically on the extension (see
 * `MCP_CODEMODE_NAMESPACE`): pi-durable 1.6.0 groups code-mode tools by
 * `Extension.namespace`, which belongs to the extension that brings the
 * tools, so there is no per-server list to refresh any more. Disabled or
 * fully hidden servers are already absent from ext-mcp's tool set.
 *
 * `quickjs-wasi` is a direct dependency: pi-codemode's worker resolves its
 * wasm from this package's tree at the first script.
 */

import { CodemodeSandbox } from "@earendil-works/pi-codemode";
import type { CodemodeSandboxBase } from "@earendil-works/pi-codemode/portable";
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
	/** Abort in-flight executions and stop the worker machinery. */
	close(): Promise<void>;
}

/** Each call builds a fresh sandbox and one extension over it. */
export function createCodemodeWiring(): CodemodeWiring {
	const sandbox = new CodemodeSandbox({
		timeoutMs: CODEMODE_TIMEOUT_MS,
		memoryLimitBytes: CODEMODE_MEMORY_LIMIT_BYTES,
	});
	const extension = createSigrunCodemodeExtension({ sandbox });
	return {
		extension,
		sandbox,
		close: () => sandbox.close(),
	};
}

export default createCodemodeWiring satisfies () => CodemodeWiring;

export {
	CODEMODE_NOT_OFFERED_NOTICE,
	CODEMODE_NOTICE_SECTION_KEY,
	MCP_CODEMODE_NAMESPACE,
	renderCodemodeNotice,
} from "./extension.js";
