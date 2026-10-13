/**
 * The codemode extension wrapper (sigrun-ext-codemode): installs upstream's
 * `codemode` extension (the `codemode` tool, named exactly, with
 * `callers: ["model"]`, plus the upstream `codemode` prompt section) with
 * our two sigrun additions:
 *
 * 1. The MCP namespace snapshot (src/config.ts): one `CodemodeNamespace`
 *    per configured MCP server, prefix `"<server>/"`, read once at factory
 *    time. The upstream section groups `agent.callable` tools by the
 *    longest matching prefix, so sigrun's `<server>/<tool>` MCP tools
 *    render grouped per server with no renames (the namespace ruler).
 *
 * 2. The warn-if-not-offered channel (the spec's corrected mechanism):
 *    when the extension is installed but the `codemode` TOOL is not
 *    model-offered in this request, a short companion section renders the
 *    enable notice instead of silence. Upstream's `codemode` section
 *    renders `undefined` when nothing is callable, and it does NOT know
 *    whether the codemode tool itself is offered — a model whose
 *    Settings → default tools excluded `codemode` would see MCP tools
 *    listed as script-callable with no way to learn the tool is off. The
 *    companion section renders NOTHING (returns undefined, so no tag is
 *    written) whenever the tool IS offered, which de-duplicates with
 *    upstream's listing by construction.
 *
 * Mechanism choice (documented for review): a `wrapSection("codemode", …)`
 * would also work — pi-durable's `resolveAgent` applies wraps across
 * selected extensions, and our factory owns both the wrapped section and
 * the wrapper — but the wrap could only prepend text around upstream's
 * render, and upstream's render already covers the offered case; the
 * companion section keys the notice to the not-offered condition exactly,
 * leaves the upstream render untouched, and renders undefined (absent from
 * the prompt, no `<key>` tag written) when offered. Companion section it
 * is. Both extensions are installed by the same factory, so the pair
 * (upstream section + notice section) travels together.
 */

import {
	CODEMODE_TOOL_NAME,
	createCodemodeExtension,
	type CodemodeNamespace,
} from "@earendil-works/pi-durable/codemode";
import type { CodemodeSandboxBase } from "@earendil-works/pi-codemode/portable";
import {
	defineExtension,
	type Extension,
	type PromptInput,
} from "@earendil-works/pi-durable";

/** Our companion section's key (distinct from upstream's `"codemode"`). */
export const CODEMODE_NOTICE_SECTION_KEY = "codemode_notice";

/** The enable notice, the spec's wording. */
export const CODEMODE_NOT_OFFERED_NOTICE =
	"codemode scripts are available but the tool is not offered; enable it " +
	"via Settings → default tools";

/**
 * The companion section render: the notice ONLY when the codemode tool
 * is installed (one of the selected extensions registers it) yet not
 * model-offered in this request (`agent.tools` is the offered set);
 * `undefined` otherwise (offered, or not installed — nothing to warn
 * about). Installation cannot be read from `agent.callable`: that set
 * holds only tools-callable tools, and `codemode` registers with
 * `callers: ["model"]`.
 */
export function renderCodemodeNotice(input: PromptInput): string | undefined {
	const installed = input.agent.extensions.some((extension) =>
		(extension.tools ?? []).some(
			(tool) => tool.name === CODEMODE_TOOL_NAME,
		),
	);
	if (!installed) return undefined; // not installed: no lie to correct
	const offered = input.agent.tools.some(
		(tool) => tool.name === CODEMODE_TOOL_NAME,
	);
	return offered ? undefined : CODEMODE_NOT_OFFERED_NOTICE;
}

/**
 * The sigrun codemode extension: upstream's `codemode` extension (tool +
 * section, with our namespace snapshot) plus the companion notice section.
 */
export function createSigrunCodemodeExtension(options: {
	/** Runs the scripts: `CodemodeSandbox` on Node. */
	readonly sandbox: CodemodeSandboxBase;
	/** The factory-time MCP namespace snapshot (src/config.ts). */
	readonly namespaces?: readonly CodemodeNamespace[];
}): Extension {
	const upstream = createCodemodeExtension({
		sandbox: options.sandbox,
		...(options.namespaces === undefined
			? {}
			: { namespaces: options.namespaces }),
	});
	return defineExtension({
		...upstream,
		sections: [
			...(upstream.sections ?? []),
			{
				key: CODEMODE_NOTICE_SECTION_KEY,
				render: renderCodemodeNotice,
			},
		],
	});
}