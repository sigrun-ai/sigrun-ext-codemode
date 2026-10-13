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
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";
/** The env override the config store reads (sigrun-ext-mcp's name). */
export const MCP_CONFIG_ENV = "SIGRUN_MCP_CONFIG";
/** The exposure words, after normalization (mcp repo's McpExposure). */
const EXPOSURE_WORDS = ["codemode", "deferred", "direct", "hidden"];
/** Parse one exposure word; the pi alias normalizes to "codemode". */
const EXPOSURE_WORD_SET = new Set(EXPOSURE_WORDS);
function parseExposure(value, where) {
    if (value === "codemode-deferred")
        return "codemode";
    if (typeof value !== "string" || !EXPOSURE_WORD_SET.has(value)) {
        throw new Error(`${where} exposure must be one of ${EXPOSURE_WORDS.map((word) => JSON.stringify(word)).join(", ")} (or "codemode-deferred", the pi alias for "codemode")`);
    }
    return value;
}
/** Resolve the config path without reading it (for diagnostics). */
export function resolveMcpConfigPath(env = process.env) {
    const override = env[MCP_CONFIG_ENV];
    if (override !== undefined && override !== "") {
        // A relative override resolves against cwd, like sigrun's other paths.
        return isAbsolute(override) ? override : resolve(override);
    }
    return resolve(homedir(), ".config", "sigrun", "mcp.json");
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
/** Whether a configured server participates at all (mcp repo's
 * `serverEnabled`): `enabled: false` and `disabled: true` both skip it. */
export function serverEnabled(server) {
    return server.enabled !== false && server.disabled !== true;
}
/** Whether every tool of this server resolves `hidden`: the server default
 * is `hidden` and no override can un-hide a tool (every override value is
 * `hidden`; an exact name or pattern pointing elsewhere un-hides whatever
 * it matches). Hidden tools never register, so such a server contributes
 * nothing scripts can call and gets no namespace. */
function serverFullyHidden(server) {
    if ((server.exposure ?? "codemode") !== "hidden")
        return false;
    return Object.values(server.toolExposure ?? {}).every((word) => word === "hidden");
}
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
export function loadNamespaces(env = process.env) {
    const path = resolveMcpConfigPath(env);
    if (!existsSync(path))
        return [];
    try {
        return parseNamespaces(readFileSync(path, "utf8"), path);
    }
    catch (cause) {
        console.warn(`sigrun-ext-codemode: mcp config ${path} is invalid (codemode ` +
            `tools install un-namespaced): ${cause instanceof Error ? cause.message : String(cause)}`);
        return [];
    }
}
/** Parse and validate the config body into the namespace snapshot. */
function parseNamespaces(text, path) {
    const parsed = JSON.parse(text);
    if (!isRecord(parsed) || !isRecord(parsed.servers)) {
        throw new Error(`must be a JSON object with a "servers" object mapping names to server entries`);
    }
    const namespaces = [];
    for (const [name, entry] of Object.entries(parsed.servers)) {
        if (!isRecord(entry)) {
            throw new Error(`server "${name}" must be an object`);
        }
        const server = parseServerEntry(entry, path, name);
        if (!serverEnabled(server))
            continue;
        if (serverFullyHidden(server)) {
            // The spec's best-effort boot log: hidden-only rows.
            console.warn(`sigrun-ext-codemode: mcp server "${name}" resolves fully ` +
                `hidden (excluded from the codemode namespaces)`);
            continue;
        }
        namespaces.push({
            name,
            description: `MCP server ${name} (tools ${name}/<tool>, registered by sigrun-ext-mcp)`,
            prefix: `${name}/`,
        });
    }
    return namespaces;
}
/** Validate one server entry's namespace-relevant fields. */
function parseServerEntry(entry, path, name) {
    for (const field of ["enabled", "disabled"]) {
        const value = entry[field];
        if (value !== undefined && typeof value !== "boolean") {
            throw new Error(`mcp config ${path}: server "${name}" ${field} must be a boolean`);
        }
    }
    return {
        ...(entry.enabled === undefined
            ? {}
            : { enabled: entry.enabled }),
        ...(entry.disabled === undefined
            ? {}
            : { disabled: entry.disabled }),
        ...(entry.exposure === undefined
            ? {}
            : {
                exposure: parseExposure(entry.exposure, `mcp config ${path}: server "${name}"`),
            }),
        ...(entry.toolExposure === undefined
            ? {}
            : {
                toolExposure: parseToolExposure(entry.toolExposure, path, name),
            }),
    };
}
function parseToolExposure(value, path, name) {
    if (!isRecord(value)) {
        throw new Error(`mcp config ${path}: server "${name}" toolExposure must be an object`);
    }
    const overrides = {};
    for (const [key, exposure] of Object.entries(value)) {
        overrides[key] = parseExposure(exposure, `mcp config ${path}: server "${name}" toolExposure "${key}"`);
    }
    return overrides;
}
