/**
 * End-to-end tests (the testable line): the model calls `codemode` with a
 * script, the script runs in the real QuickJS sandbox, and its nested
 * tool calls flow through the full harness pipeline (api.executeTool →
 * nested ToolTask → the read tool's environment). Runs a REAL pi-durable
 * Harness (registry + faux provider), mirroring sigrun-ext-mcp's test
 * idiom — no sigrun-core dependency.
 *
 * Order note (the wall-clock budget): the runaway-script test is the LAST
 * test in the file, so a wall-clock death on it still ships the rest.
 */

import { expect, test } from "vitest";
import { join } from "node:path";
import * as fs from "node:fs";
import { vi } from "vitest";

vi.mock("node:fs", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs")>();
	return {
		...actual,
		readFileSync: vi.fn(actual.readFileSync),
		existsSync: vi.fn(actual.existsSync),
	};
});
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
	fauxAssistantMessage,
	fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";
import {
	cleanupDir,
	closeOpened,
	fakeHost,
	openCodemodeHarness,
	server,
	tempDir,
} from "./harness.js";

/** Drive one model-issued codemode call and return the tool result entry. */
async function driveCodemode(
	opened: Awaited<ReturnType<typeof openCodemodeHarness>>,
	script: string,
): Promise<{ result: { content: { type: string; text?: string }[]; isError: boolean; details?: unknown }; transcript: string }> {
	const root = await opened.harness.root(BACKGROUND_CONTEXT, {
		agent: { model: opened.defaultModel },
	});
	const submission = await root.submit(
		{ type: "input", content: "run the script" },
		BACKGROUND_CONTEXT,
	);
	const settled = await submission.wait(BACKGROUND_CONTEXT);
	expect(settled.status).toBe("done");
	await root.waitForIdle(BACKGROUND_CONTEXT);
	const page = await root.entries({}, 50, undefined, BACKGROUND_CONTEXT);
	const transcript = JSON.stringify(page.items);
	const toolResult = page.items.find((entry) =>
		entry.model?.some(
			(message) =>
				(message as { role?: string; toolName?: string }).role ===
					"toolResult" &&
				(message as { role?: string; toolName?: string }).toolName ===
					"codemode",
		),
	);
	expect(toolResult).toBeDefined();
	const message = toolResult!.model![0] as {
		role: string;
		toolName: string;
		content: { type: string; text?: string }[];
		isError: boolean;
		details?: unknown;
	};
	return { result: message, transcript };
}

test("the codemode tool is registered, model-offered, with the section and empty-namespace config", async () => {
	const dir = await tempDir("sigrun-codemode-reg-");
	try {
		// No mcp.json in dir → empty namespaces; the tool + section still ship.
		const opened = await openCodemodeHarness(dir);
		try {
			const tools = opened.registry
				.snapshot()
				.tools()
				.map(({ tool }) => tool.name);
			expect(tools).toContain("codemode");
			const codemode = opened.registry
				.snapshot()
				.tools()
				.find(({ tool }) => tool.name === "codemode")!;
			// The spec's exact registration: named "codemode", callers model.
			expect(codemode.tool.callers).toEqual(["model"]);
			expect(codemode.tool.name).toBe("codemode");
			expect(opened.wiring.namespaces).toEqual([]);

			// The upstream `codemode` section renders from agent.callable.
			const root = await opened.harness.root(BACKGROUND_CONTEXT, {});
			const agent = await root.agent(BACKGROUND_CONTEXT);
			expect(agent.sections.map((section) => section.key)).toContain(
				"codemode",
			);
			const rendered = await Promise.resolve(
				agent.sections
					.find((section) => section.key === "codemode")!
					.render(
						{
							conversationId: root.id,
							agent,
							env: undefined,
							shown: {},
							read: undefined as never,
						},
						BACKGROUND_CONTEXT,
					),
			);
			expect(rendered).toBeDefined();
			expect(rendered).toContain("read");
			// And the companion notice renders NOTHING when offered.
			expect(
				agent.sections.find(
					(section) => section.key === "codemode_notice",
				),
			).toBeDefined();
			const notice = await Promise.resolve(
				agent.sections
					.find((section) => section.key === "codemode_notice")!
					.render(
						{
							conversationId: root.id,
							agent,
							env: undefined,
							shown: {},
							read: undefined as never,
						},
						BACKGROUND_CONTEXT,
					),
			);
			expect(notice).toBeUndefined();
		} finally {
			await closeOpened(opened);
		}
	} finally {
		await cleanupDir(dir);
	}
});

test("namespaces come from mcp.servers", async () => {
	const dir = await tempDir("sigrun-codemode-ns-");
	try {
		const opened = await openCodemodeHarness(dir, undefined, fakeHost([
			server("acme"),
			server("off", { enabled: false }),
		]));
		try {
			expect(opened.wiring.namespaces).toEqual([
				{
					name: "acme",
					description:
						"MCP server acme (tools acme/<tool>, registered by sigrun-ext-mcp)",
					prefix: "acme/",
				},
			]);
		} finally {
			await closeOpened(opened);
		}
	} finally {
		await cleanupDir(dir);
	}
});

test("no mcp.json is read", async () => {
	const dir = await tempDir("sigrun-codemode-no-config-");
	try {
		const read = vi.mocked(fs.readFileSync);
		const exists = vi.mocked(fs.existsSync);
		read.mockClear();
		exists.mockClear();
		const opened = await openCodemodeHarness(dir, undefined, fakeHost([
			server("acme"),
		]));
		try {
			const touched = [...read.mock.calls, ...exists.mock.calls]
				.map(([path]) => String(path))
				.filter((path) => path.endsWith("mcp.json"));
			expect(touched).toEqual([]);
			expect(opened.wiring.namespaces.map(({ name }) => name)).toEqual(["acme"]);
		} finally {
			await closeOpened(opened);
		}
	} finally {
		await cleanupDir(dir);
	}
});

test("a fully hidden server is excluded", async () => {
	const dir = await tempDir("sigrun-codemode-hidden-");
	try {
		const opened = await openCodemodeHarness(dir, undefined, fakeHost([
			server("visible"),
			server("hidden", { exposure: "hidden" }),
			server("unhidden", {
				exposure: "hidden",
				toolExposure: { echo: "direct" },
			}),
		]));
		try {
			expect(opened.wiring.namespaces.map(({ name }) => name)).toEqual([
				"visible",
				"unhidden",
			]);
		} finally {
			await closeOpened(opened);
		}
	} finally {
		await cleanupDir(dir);
	}
});

test("the model calls codemode with a script calling tools.read, and the content returns", async () => {
	const dir = await tempDir("sigrun-codemode-read-");
	try {
		const opened = await openCodemodeHarness(dir, [
			fauxAssistantMessage(
				fauxToolCall(
					"codemode",
					{ code: 'return await tools.read({ path: "note.txt" });' },
					{ id: "call-1" },
				),
				{ stopReason: "toolUse" },
			),
			fauxAssistantMessage("done after script"),
		]);
		try {
			const { result, transcript } = await driveCodemode(opened, "");
			expect(result.isError).toBe(false);
			expect(result.content.some((block) => block.text === "sigrun codemode says hi")).toBe(true);
			// The script's nested call appears in details.calls.
			expect(transcript).toContain("note.txt");
		} finally {
			await closeOpened(opened);
		}
	} finally {
		await cleanupDir(dir);
	}
});

test("store()/load() round-trip across two codemode calls on one conversation", async () => {
	const dir = await tempDir("sigrun-codemode-store-");
	try {
		const opened = await openCodemodeHarness(dir, [
			fauxAssistantMessage(
				fauxToolCall(
					"codemode",
					{ code: 'store("count", 41); return "stored";' },
					{ id: "call-1" },
				),
				{ stopReason: "toolUse" },
			),
			fauxAssistantMessage("ack"),
			fauxAssistantMessage(
				fauxToolCall(
					"codemode",
					{ code: 'return `count is ${load("count")}`;' },
					{ id: "call-2" },
				),
				{ stopReason: "toolUse" },
			),
			fauxAssistantMessage("done"),
		]);
		try {
			const root = await opened.harness.root(BACKGROUND_CONTEXT, {
				agent: { model: opened.defaultModel },
			});
			const first = await root.submit(
				{ type: "input", content: "store it" },
				BACKGROUND_CONTEXT,
			);
			await first.wait(BACKGROUND_CONTEXT);
			await root.waitForIdle(BACKGROUND_CONTEXT);
			const second = await root.submit(
				{ type: "input", content: "load it" },
				BACKGROUND_CONTEXT,
			);
			await second.wait(BACKGROUND_CONTEXT);
			await root.waitForIdle(BACKGROUND_CONTEXT);
			const page = await root.entries({}, 50, undefined, BACKGROUND_CONTEXT);
			const transcript = JSON.stringify(page.items);
			expect(transcript).toContain("stored");
			expect(transcript).toContain("count is 41");
		} finally {
			await closeOpened(opened);
		}
	} finally {
		await cleanupDir(dir);
	}
});

test("a fork sees the parent's stored values as of the fork entry", async () => {
	const dir = await tempDir("sigrun-codemode-fork-");
	try {
		const opened = await openCodemodeHarness(dir, [
			fauxAssistantMessage(
				fauxToolCall(
					"codemode",
					{ code: 'store("answer", 42); return "stored 42";' },
					{ id: "call-1" },
				),
				{ stopReason: "toolUse" },
			),
			fauxAssistantMessage("ack"),
			// The fork's turn: its codemode call reads the store as of the fork.
			fauxAssistantMessage(
				fauxToolCall(
					"codemode",
					{ code: 'return `fork sees ${load("answer")}`;' },
					{ id: "call-2" },
				),
				{ stopReason: "toolUse" },
			),
			fauxAssistantMessage("fork done"),
		]);
		try {
			const root = await opened.harness.root(BACKGROUND_CONTEXT, {
				agent: { model: opened.defaultModel },
			});
			const submission = await root.submit(
				{ type: "input", content: "store 42" },
			BACKGROUND_CONTEXT,
			);
			await submission.wait(BACKGROUND_CONTEXT);
			await root.waitForIdle(BACKGROUND_CONTEXT);
			const page = await root.entries({}, 50, undefined, BACKGROUND_CONTEXT);
			// Fork at the newest entry (the store call's result entry): the
			// fork's store doc is copied as of this point, 42 included.
			const newest = page.items[0]!;
			const forked = await root.fork(
				newest.id,
				{ ownership: { kind: "ownerless" }, agent: { model: opened.defaultModel } },
				BACKGROUND_CONTEXT,
			);
			const forkSubmission = await forked.submit(
				{ type: "input", content: "load it in the fork" },
				BACKGROUND_CONTEXT,
			);
			const forkSettled = await forkSubmission.wait(BACKGROUND_CONTEXT);
			expect(forkSettled.status).toBe("done");
			await forked.waitForIdle(BACKGROUND_CONTEXT);
			const forkPage = await forked.entries(
				{},
				50,
				undefined,
				BACKGROUND_CONTEXT,
			);
			const forkTranscript = JSON.stringify(forkPage.items);
			expect(forkTranscript).toContain("fork sees 42");
		} finally {
			await closeOpened(opened);
		}
	} finally {
		await cleanupDir(dir);
	}
});

test("a failing script yields a partial-output error result", async () => {
	const dir = await tempDir("sigrun-codemode-fail-");
	try {
		const opened = await openCodemodeHarness(dir, [
			fauxAssistantMessage(
				fauxToolCall(
					"codemode",
					{
						code: 'text("partial output before the boom");\nthrow new Error("boom: deliberate failure");',
					},
					{ id: "call-1" },
				),
				{ stopReason: "toolUse" },
			),
			fauxAssistantMessage("done after failure"),
		]);
		try {
			const { result } = await driveCodemode(opened, "");
			expect(result.isError).toBe(true);
			const text = result.content.map((block) => block.text ?? "").join("\n");
			expect(text).toContain("Script failed");
			expect(text).toContain("partial output before the boom");
			expect(text).toContain("boom: deliberate failure");
		} finally {
			await closeOpened(opened);
		}
	} finally {
		await cleanupDir(dir);
	}
});

test("details.calls and pi.live.nestedTools records appear", async () => {
	const dir = await tempDir("sigrun-codemode-details-");
	try {
		const opened = await openCodemodeHarness(dir, [
			fauxAssistantMessage(
				fauxToolCall(
					"codemode",
					{ code: 'const t = await tools.read({ path: "note.txt" }); return t.length;' },
					{ id: "call-1" },
				),
				{ stopReason: "toolUse" },
			),
			fauxAssistantMessage("done"),
		]);
		try {
			const root = await opened.harness.root(BACKGROUND_CONTEXT, {
				agent: { model: opened.defaultModel },
			});
			// pi-durable 1.5.0 removed watchEvents (upstream #11327): the
			// conversation view carries the live state — nested tool slots
			// live at pi.live.nestedTools while a nested call runs.
			const liveViewSnapshot: unknown[][] = [];
			const liveViewCapture = (view: { docs?: Record<string, unknown> }): void => {
				const live = view.docs?.["pi.live"] as
					| { nestedTools?: unknown[] }
					| undefined;
				if (live !== undefined) liveViewSnapshot.push(live.nestedTools ?? []);
			};
			const watch = await root.watch(BACKGROUND_CONTEXT);
			liveViewCapture(watch.value);
			watch.start(async (call) => {
				if (call.kind === "value") liveViewCapture(call.value);
			});
			try {
				const submission = await root.submit(
					{ type: "input", content: "read via script" },
					BACKGROUND_CONTEXT,
				);
				await submission.wait(BACKGROUND_CONTEXT);
				await root.waitForIdle(BACKGROUND_CONTEXT);
			} finally {
				await watch.stop().catch(() => undefined);
			}
			const page = await root.entries({}, 50, undefined, BACKGROUND_CONTEXT);
			const transcript = JSON.stringify(page.items);
			// details.calls: the codemode result entry carries the nested call row.
			expect(transcript).toContain('"calls"');
			expect(transcript).toContain('"name":"read"');
			// pi.live.nestedTools: the live state showed the nested slot.
			const nestedSlots = liveViewSnapshot.flat().filter(
				(slot) =>
					(slot as { name?: string }).name === "read",
			);
			expect(nestedSlots.length).toBeGreaterThanOrEqual(1);
		} finally {
			await closeOpened(opened);
		}
	} finally {
		await cleanupDir(dir);
	}
});

test("a runaway while(true){} script ends at the deadline with the harness healthy (LAST: wall-clock safety)", async () => {
	const dir = await tempDir("sigrun-codemode-runaway-");
	try {
		const opened = await openCodemodeHarness(dir, [
			fauxAssistantMessage(
				fauxToolCall(
					"codemode",
					{
						// The script's own options line sets the deadline (the
						// durable tool path reads timeout_ms from here — the
						// sandbox constructor default does not apply to
						// sandbox.start(); verified against pi-codemode 1.2.0).
						code: '// @options: {"timeout_ms": 1000}\nwhile (true) {}',
					},
					{ id: "call-1" },
				),
				{ stopReason: "toolUse" },
			),
			fauxAssistantMessage("done after runaway"),
			fauxAssistantMessage(
				fauxToolCall(
					"codemode",
					{ code: 'return "harness still healthy";' },
					{ id: "call-2" },
				),
				{ stopReason: "toolUse" },
			),
			fauxAssistantMessage("done"),
		]);
		try {
			const started = Date.now();
			const { result } = await driveCodemode(opened, "");
			const elapsed = Date.now() - started;
			// The deadline governed: not instant, not the 300s constructor cap.
			expect(elapsed).toBeGreaterThanOrEqual(900);
			expect(elapsed).toBeLessThan(60_000);
			expect(result.isError).toBe(true);
			const text = result.content.map((block) => block.text ?? "").join("\n");
			expect(text).toContain("Script failed");
			expect(text).toContain("Script timed out");

			// The harness stays healthy: the next codemode call works.
			const root = await opened.harness.root(BACKGROUND_CONTEXT, {
				agent: { model: opened.defaultModel },
			});
			const second = await root.submit(
				{ type: "input", content: "again" },
				BACKGROUND_CONTEXT,
			);
			await second.wait(BACKGROUND_CONTEXT);
			await root.waitForIdle(BACKGROUND_CONTEXT);
			const page = await root.entries({}, 50, undefined, BACKGROUND_CONTEXT);
			const transcript = JSON.stringify(page.items);
			expect(transcript).toContain("harness still healthy");
		} finally {
			await closeOpened(opened);
		}
	} finally {
		await cleanupDir(dir);
	}
}, 120_000);