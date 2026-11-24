/**
 * The code-mode namespace boundary: pi-durable 1.6.0 groups a code-mode
 * tool by the `namespace` its OWN extension declares, so sigrun's MCP tools
 * — all registered by ext-mcp's single extension — share one static
 * namespace. These tests pin that contract and prove the section renders
 * from it with no per-server list, no refresh hooks, and no mcp.json read.
 */

import { expect, test } from "vitest";
import { createCodemodeWiring, MCP_CODEMODE_NAMESPACE } from "../src/index.js";
import type { CodemodeSandboxBase } from "@earendil-works/pi-codemode/portable";

/** The upstream `codemode` section of this wiring's extension. */
function codemodeSection(wiring: ReturnType<typeof createCodemodeWiring>) {
	const section = wiring.extension.sections?.find(({ key }) => key === "codemode");
	if (section === undefined) throw new Error("the codemode section is missing");
	return section;
}

test("the extension declares exactly one static mcp namespace", async () => {
	const wiring = createCodemodeWiring();
	try {
		expect(wiring.extension.namespace).toEqual(MCP_CODEMODE_NAMESPACE);
		// Static: nothing in the wiring can rename it between runs, which is
		// the property the old refresh machinery existed to provide.
		expect(MCP_CODEMODE_NAMESPACE.name).toBe("mcp");
	} finally {
		await wiring.close();
	}
});

test("several servers' tools render under the one heading", async () => {
	const wiring = createCodemodeWiring();
	try {
		const callable = [
			{ name: "acme/echo", description: "Echo", parameters: {} },
			{ name: "beta/ping", description: "Ping", parameters: {} },
		];
		const rendered = await codemodeSection(wiring).render(
			{
				agent: {
					extensions: [wiring.extension],
					callable,
					tools: [{ name: "codemode" }],
				},
			} as never,
			{} as never,
		);
		expect(rendered).toContain("## mcp");
		// Both tools, one heading: no per-server sections.
		expect(rendered).toContain("acme/echo");
		expect(rendered).toContain("beta/ping");
		expect(rendered).not.toContain("## acme");
		expect(rendered).not.toContain("## beta");
	} finally {
		await wiring.close();
	}
});

test("the namespace lists with no tools yet, so the section is stable", async () => {
	// A server still connecting has not registered its tools; the namespace
	// heading must already be there, or the prompt would shift when it lands.
	const wiring = createCodemodeWiring();
	try {
		const rendered = await codemodeSection(wiring).render(
			{
				agent: {
					extensions: [wiring.extension],
					callable: [],
					tools: [{ name: "codemode" }],
				},
			} as never,
			{} as never,
		);
		expect(rendered).toContain("## mcp");
	} finally {
		await wiring.close();
	}
});

test("the wiring exposes no refresh surface: the namespace is static", () => {
	const wiring = createCodemodeWiring();
	const keys = Object.keys(wiring).sort();
	expect(keys).toEqual(["close", "extension", "sandbox"]);
	// The sandbox is what close() releases; a stub is enough to assert shape.
	expect(typeof (wiring.sandbox as CodemodeSandboxBase)).toBe("object");
	return wiring.close();
});
