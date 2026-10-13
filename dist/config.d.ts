/**
 * The codemode config snapshot: the mcp.json-derived namespace list.
 *
 * Reuses the MCP config RESOLUTION and the namespace-relevant parse SHAPES
 * from sigrun-ext-mcp (rev-3 ruling accepts the duplicated parse of the
 * config file across repos; sigrun-ext-mcp is not npm-published, so its
 * `parseMcpConfig` cannot be imported here — the shapes are duplicated
 * with the derivations quoted below for review parity).
 *
 * Resolution order (identical to sigrun-ext-mcp src/config.ts):
 *   1. `SIGRUN_MCP_CONFIG` env override — an explicit path to an mcp.json
 *   2. `~/.config/sigrun/mcp.json` (the sigrun config dir)
 *
 * What we read from each server entry:
 *   - `serverEnabled` (mcp repo's derivation): `enabled: false` OR
 *     `disabled: true` skips the server entirely.
 *   - Exposure (mcp repo's shape): a server-default `exposure` word, plus
 *     `toolExposure` overrides mapping exact tool names or `*`-patterns to
 *     exposure words; the pi alias `codemode-deferred` normalizes to
 *     `codemode`. A server whose tools all resolve `hidden` contributes
 *     nothing scripts can call (hidden tools never register), so it is
 *     excluded from the snapshot: that happens when the server default is
 *     `hidden` and every override is `hidden` too (an exact name wins over
 *     patterns; among patterns the first match in config order wins — so
 *     only a fully-hidden override table leaves every tool hidden).
 *
 * Snapshot semantics (the spec ruling): the config is read ONCE at factory
 * time; late or flapping servers render un-namespaced in the section until
 * the next boot. The section BODY re-renders live from
 * `PromptInput.agent.callable` each turn (upstream's render), so tool
 * lists are never stale — only the namespace GROUPING is a snapshot.
 */
import type { CodemodeNamespace } from "@earendil-works/pi-durable/codemode";
/** The env override the config store reads (sigrun-ext-mcp's name). */
export declare const MCP_CONFIG_ENV = "SIGRUN_MCP_CONFIG";
/** The exposure words, after normalization (mcp repo's McpExposure). */
declare const EXPOSURE_WORDS: readonly ["codemode", "deferred", "direct", "hidden"];
type ExposureWord = (typeof EXPOSURE_WORDS)[number];
/** One server entry as this package needs it (a subset of the mcp repo's
 * McpServerConfig: only the namespace-relevant fields). */
export interface McpServerEntry {
    /** Skip this server entirely (either false means off). */
    readonly enabled?: boolean;
    readonly disabled?: boolean;
    /** Server-default exposure (default "codemode"). */
    readonly exposure?: ExposureWord;
    /** Per-tool overrides: exact names beat `*`-patterns; first pattern wins. */
    readonly toolExposure?: Readonly<Record<string, ExposureWord>>;
}
/** Resolve the config path without reading it (for diagnostics). */
export declare function resolveMcpConfigPath(env?: NodeJS.ProcessEnv): string;
/** Whether a configured server participates at all (mcp repo's
 * `serverEnabled`): `enabled: false` and `disabled: true` both skip it. */
export declare function serverEnabled(server: McpServerEntry): boolean;
/**
 * Read the mcp.json from the resolved path and build the namespace
 * snapshot: one `CodemodeNamespace` per participating server with prefix
 * `"<server>/"` (the namespace ruler: our tool-name shape is already
 * `<server>/<tool>`, so upstream's longest-prefix grouping needs no renames).
 *
 * A missing file is an EMPTY namespace list (the extension still ships its
 * codemode tool + section). An existing-but-bad file or entry warns at
 * factory time (the spec's best-effort boot log; NOT the contract — a bad
 * config must not cost the model its codemode tool) and the extension
 * installs un-namespaced rather than throwing.
 */
export declare function loadNamespaces(env?: NodeJS.ProcessEnv): readonly CodemodeNamespace[];
export {};
