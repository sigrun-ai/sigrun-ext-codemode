/**
 * sigrun-ext-codemode: the codemode factory (the loader contract).
 *
 * MCP namespaces come from ext-mcp's `mcp.servers` published hook. Codemode
 * loads before ext-mcp, so the factory starts (but never awaits) the first
 * refresh; committed settings writes and the per-run lifecycle refresh it
 * again. Upstream reads the namespaces array at use time, so the
 * owned array is updated in place rather than replaced.
 *
 * `quickjs-wasi` is a direct dependency: pi-codemode's worker resolves its
 * wasm from this package's tree at the first script.
 */
import type { CodemodeSandboxBase } from "@earendil-works/pi-codemode/portable";
import type { CodemodeNamespace } from "@earendil-works/pi-durable/codemode";
import type { Extension } from "@earendil-works/pi-durable";
import type { SigrunExtensionResult, SigrunHost } from "@sigrun/sigrun/extension";
/** Pinned per-execution wall-clock deadline (pi-codemode's default). */
export declare const CODEMODE_TIMEOUT_MS = 300000;
/** Pinned QuickJS heap cap (256 MiB; upstream default is unbounded). */
export declare const CODEMODE_MEMORY_LIMIT_BYTES: number;
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
    /** Refresh after every settled run. */
    readonly runSettled: NonNullable<SigrunExtensionResult["runSettled"]>;
    /** Refresh immediately after any committed settings write. */
    readonly onSettingsChanged: NonNullable<SigrunExtensionResult["onSettingsChanged"]>;
    /** Abort in-flight executions and stop the worker machinery. */
    close(): Promise<void>;
}
/** Each call builds a fresh sandbox and one live array shared with upstream. */
export declare function createCodemodeWiring(host?: SigrunHost): CodemodeWiring;
declare const _default: typeof createCodemodeWiring;
export default _default;
export { CODEMODE_NOT_OFFERED_NOTICE, CODEMODE_NOTICE_SECTION_KEY, renderCodemodeNotice, } from "./extension.js";
