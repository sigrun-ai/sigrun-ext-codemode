/** The published-hook namespace boundary: loading never blocks on the registry,
 * while the array passed upstream keeps its identity as settings change. */

import { expect, test, vi } from "vitest";
import { createCodemodeWiring } from "../src/index.js";
import { createSigrunCodemodeExtension } from "../src/extension.js";
import { fakeHost, server } from "./harness.js";
import type { SigrunHost } from "@sigrun/sigrun/extension";
import type { CodemodeSandboxBase } from "@earendil-works/pi-codemode/portable";

function sandbox(): CodemodeSandboxBase {
	return {
		async start() { throw new Error("not used by this test"); },
		async close() {},
	} as unknown as CodemodeSandboxBase;
}

test("a standalone wiring without a host stays empty without rejecting", async () => {
	const wiring = createCodemodeWiring(undefined as never);
	try {
		await expect(wiring.ready).resolves.toBeUndefined();
		expect(wiring.namespaces).toEqual([]);
	} finally {
		await wiring.close();
	}
});

test("namespaces fill after loading without blocking the factory", async () => {
	let answer!: (value: unknown) => void;
	const pending = new Promise((resolve) => { answer = resolve; });
	const host = {
		publishedHooks: { call: () => pending },
	} as unknown as SigrunHost;
	const wiring = createCodemodeWiring(host);
	try {
		expect(wiring.namespaces).toEqual([]);
		answer({
			status: "ok",
			provider: "sigrun-mcp",
			value: { servers: [server("acme")] },
		});
		await wiring.ready;
		expect(wiring.namespaces.map(({ name }) => name)).toEqual(["acme"]);
	} finally {
		await wiring.close();
	}
});

test("a server added in MCP settings appears at the next run", async () => {
	const servers = [server("acme")];
	const wiring = createCodemodeWiring(fakeHost(servers));
	try {
		await wiring.ready;
		expect(wiring.namespaces.map(({ name }) => name)).toEqual(["acme"]);
		servers.push(server("beta"));
		// A committed MCP settings write fans out to every extension.
		await wiring.onSettingsChanged(["servers"], undefined);
		expect(wiring.namespaces.map(({ name }) => name)).toEqual(["acme", "beta"]);
		const section = wiring.extension.sections?.find(({ key }) => key === "codemode");
		const rendered = await section!.render({
			agent: { callable: [{ name: "beta/echo", description: "Echo", parameters: {} }] },
		} as never, {} as never);
		expect(rendered).toContain("## beta");
	} finally {
		await wiring.close();
	}
});

test("runSettled refreshes namespaces for the next run", async () => {
	const servers = [server("acme")];
	const wiring = createCodemodeWiring(fakeHost(servers));
	try {
		await wiring.ready;
		servers.push(server("beta"));
		await wiring.runSettled({} as never, {} as never, {} as never);
		expect(wiring.namespaces.map(({ name }) => name)).toEqual(["acme", "beta"]);
	} finally {
		await wiring.close();
	}
});

test("an absent mcp.servers provider stays quiet", async () => {
	const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
	const host = {
		publishedHooks: { call: async () => ({ status: "absent" as const }) },
	} as unknown as SigrunHost;
	const absentWiring = createCodemodeWiring(host);
	try {
		await absentWiring.ready;
		await absentWiring.onSettingsChanged(["servers"], undefined);
		expect(warn).not.toHaveBeenCalled();
		expect(absentWiring.namespaces).toEqual([]);
	} finally {
		await absentWiring.close();
		warn.mockRestore();
	}
});

test("a rejected refresh resolves safely and warns once per failed status", async () => {
	const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
	try {
		let fail = true;
		const host = {
			publishedHooks: {
				async call() {
					if (fail) throw new Error("registry unavailable");
					return {
						status: "ok" as const,
						provider: "sigrun-mcp",
						value: { servers: [server("acme")] },
					};
				},
			},
		} as unknown as SigrunHost;
		const wiring = createCodemodeWiring(host);
		try {
			await expect(wiring.ready).resolves.toBeUndefined();
			await wiring.onSettingsChanged(["servers"], undefined);
			expect(warn).toHaveBeenCalledTimes(1);
			expect(warn.mock.calls[0]?.[0]).toContain("registry unavailable");
			fail = false;
			await wiring.onSettingsChanged(["servers"], undefined);
			expect(wiring.namespaces.map(({ name }) => name)).toEqual(["acme"]);
			fail = true;
			await wiring.onSettingsChanged(["servers"], undefined);
			expect(warn).toHaveBeenCalledTimes(2);
		} finally {
			await wiring.close();
		}
	} finally {
		warn.mockRestore();
	}
});

test("upstream reads namespaces at use time", async () => {
	const namespaces = [{
		name: "acme",
		description: "acme tools",
		prefix: "acme/",
	}];
	const extension = createSigrunCodemodeExtension({ sandbox: sandbox(), namespaces });
	const section = extension.sections?.find(({ key }) => key === "codemode");
	expect(section).toBeDefined();
	const input = {
		agent: { callable: [{ name: "acme/echo", description: "Echo", parameters: {} }] },
	};
	const before = await section!.render(input as never, {} as never);
	expect(before).toContain("## acme");
	namespaces.pop();
	const after = await section!.render(input as never, {} as never);
	expect(after).not.toContain("## acme");
});
