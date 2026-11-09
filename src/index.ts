/**
 * sigrun-ext-codemode: the codemode factory (the loader contract).
 *
 * MCP namespaces come from ext-mcp's `mcp.servers` published hook. Codemode
 * loads before ext-mcp, so the factory starts (but never awaits) the first
 * refresh; the per-run lifecycle handler refreshes it again. Upstream reads
 * the namespaces array at section-render and script-execution time, so the
 * owned array is updated in place rather than replaced.
 *
 * `quickjs-wasi` is a direct dependency: pi-codemode's worker resolves its
 * wasm from this package's tree at the first script.
 */

import { CodemodeSandbox } from "@earendil-works/pi-codemode";
import type { CodemodeSandboxBase } from "@earendil-works/pi-codemode/portable";
import type { CodemodeNamespace } from "@earendil-works/pi-durable/codemode";
import { createSigrunCodemodeExtension } from "./extension.js";
import type { Extension } from "@earendil-works/pi-durable";
import type { SigrunExtensionResult, SigrunHost } from "@sigrun/sigrun/extension";

/** Pinned per-execution wall-clock deadline (pi-codemode's default). */
export const CODEMODE_TIMEOUT_MS = 300_000;

/** Pinned QuickJS heap cap (256 MiB; upstream default is unbounded). */
export const CODEMODE_MEMORY_LIMIT_BYTES = 256 * 1024 * 1024;

interface McpServer {
	readonly name: string;
	readonly enabled: boolean;
	readonly exposure: "codemode" | "deferred" | "direct" | "hidden";
	readonly toolExposure: Readonly<Record<string, McpServer["exposure"]>>;
}

/** Hidden-only servers have no tools scripts can call. */
function fullyHidden(server: McpServer): boolean {
	return server.exposure === "hidden" &&
		Object.values(server.toolExposure).every((exposure) => exposure === "hidden");
}

/** What {@link createCodemodeWiring} returns (the loader contract). */
export interface CodemodeWiring {
	/** The extension to install into the harness registry. */
	readonly extension: Extension;
	/** The sandbox the extension runs scripts in (call `close()` on shutdown). */
	readonly sandbox: CodemodeSandboxBase;
	/** The live namespace list, refreshed after loading and between runs. */
	readonly namespaces: readonly CodemodeNamespace[];
	/** The initial hook call; the factory itself never waits on it. */
	readonly ready: Promise<void>;
	/** Refresh before a newly created conversation's first run. */
	readonly conversationCreated: NonNullable<SigrunExtensionResult["conversationCreated"]>;
	/** Refresh after every settled run so the next run sees settings writes. */
	readonly runSettled: NonNullable<SigrunExtensionResult["runSettled"]>;
	/** Abort in-flight executions and stop the worker machinery. */
	close(): Promise<void>;
}

/** Each call builds a fresh sandbox and one live array shared with upstream. */
export function createCodemodeWiring(host?: SigrunHost): CodemodeWiring {
	const namespaces: CodemodeNamespace[] = [];
	const sandbox = new CodemodeSandbox({
		timeoutMs: CODEMODE_TIMEOUT_MS,
		memoryLimitBytes: CODEMODE_MEMORY_LIMIT_BYTES,
	});
	const extension = createSigrunCodemodeExtension({ sandbox, namespaces });
	const refreshNamespaces = async (): Promise<void> => {
		if (host === undefined) return;
		const result = await host.publishedHooks.call("mcp.servers", {});
		if (result.status !== "ok") return;
		const { servers } = result.value as { readonly servers: readonly McpServer[] };
		const next = servers
			.filter((server) => server.enabled && !fullyHidden(server))
			.map((server) => ({
				name: server.name,
				description: `MCP server ${server.name} (tools ${server.name}/<tool>, registered by sigrun-ext-mcp)`,
				prefix: `${server.name}/`,
			}));
		namespaces.splice(0, namespaces.length, ...next);
	};
	return {
		extension,
		sandbox,
		namespaces,
		ready: refreshNamespaces(),
		conversationCreated: refreshNamespaces,
		runSettled: refreshNamespaces,
		close: () => sandbox.close(),
	};
}

export default createCodemodeWiring satisfies (
	host?: SigrunHost,
) => CodemodeWiring;

export {
	CODEMODE_NOT_OFFERED_NOTICE,
	CODEMODE_NOTICE_SECTION_KEY,
	renderCodemodeNotice,
} from "./extension.js";
