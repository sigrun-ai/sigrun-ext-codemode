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
import { CodemodeSandbox } from "@earendil-works/pi-codemode";
import { createSigrunCodemodeExtension } from "./extension.js";
/** Pinned per-execution wall-clock deadline (pi-codemode's default). */
export const CODEMODE_TIMEOUT_MS = 300_000;
/** Pinned QuickJS heap cap (256 MiB; upstream default is unbounded). */
export const CODEMODE_MEMORY_LIMIT_BYTES = 256 * 1024 * 1024;
/** Hidden-only servers have no tools scripts can call. */
function fullyHidden(server) {
    return server.exposure === "hidden" &&
        Object.values(server.toolExposure).every((exposure) => exposure === "hidden");
}
/** Each call builds a fresh sandbox and one live array shared with upstream. */
export function createCodemodeWiring(host) {
    const namespaces = [];
    const sandbox = new CodemodeSandbox({
        timeoutMs: CODEMODE_TIMEOUT_MS,
        memoryLimitBytes: CODEMODE_MEMORY_LIMIT_BYTES,
    });
    const extension = createSigrunCodemodeExtension({ sandbox, namespaces });
    let failure;
    const refreshNamespaces = async () => {
        if (host === undefined)
            return;
        let problem;
        try {
            const result = await host.publishedHooks.call("mcp.servers", {});
            if (result.status === "absent") {
                // MCP is optional: an intentionally disabled provider is not a failure.
            }
            else if (result.status !== "ok") {
                problem = `status ${result.status}`;
            }
            else {
                const { servers } = result.value;
                const next = servers
                    .filter((server) => server.enabled && !fullyHidden(server))
                    .map((server) => ({
                    name: server.name,
                    description: `MCP server ${server.name} (tools ${server.name}/<tool>, registered by sigrun-ext-mcp)`,
                    prefix: `${server.name}/`,
                }));
                namespaces.splice(0, namespaces.length, ...next);
            }
        }
        catch (cause) {
            problem = cause instanceof Error ? cause.message : String(cause);
        }
        if (problem !== undefined && problem !== failure) {
            console.warn(`sigrun-ext-codemode: mcp.servers refresh failed: ${problem}`);
        }
        failure = problem;
    };
    return {
        extension,
        sandbox,
        namespaces,
        ready: refreshNamespaces(),
        conversationCreated: refreshNamespaces,
        runSettled: refreshNamespaces,
        onSettingsChanged: refreshNamespaces,
        close: () => sandbox.close(),
    };
}
export default createCodemodeWiring;
export { CODEMODE_NOT_OFFERED_NOTICE, CODEMODE_NOTICE_SECTION_KEY, renderCodemodeNotice, } from "./extension.js";
