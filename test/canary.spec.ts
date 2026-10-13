/**
 * The in-image canary (the spec's boot smoke): execute a trivial script
 * against the BUILT package (dist/, not the ts src) — proving the whole
 * chain resolves at runtime: the package's default export, the factory,
 * the codemode tool, and (critically) `quickjs-wasi/quickjs.wasm` on disk,
 * whose absence would otherwise surface only as a 500 on the first real
 * script in prod. Runs as a normal repo test for now; Task 8 wires the
 * same assertions into the container image build.
 */

import { expect, test } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { fauxProvider } from "@earendil-works/pi-ai/providers/faux";
import { createModels } from "@earendil-works/pi-ai/models";
import {
	fauxAssistantMessage,
	fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";
import {
	createRegistry,
	Harness,
	type ModelRef,
} from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";

test("the BUILT package runs `return 1+1` (boot smoke)", async () => {
	// The wasm file must resolve from THIS package's tree (the reviewer
	// finding: a re-pinned transitive quickjs-wasi strands it). Assert it
	// explicitly before running anything.
	const require = createRequire(import.meta.url);
	const wasmPath = require.resolve("quickjs-wasi/quickjs.wasm");
	expect(wasmPath).toContain("quickjs.wasm");
	const { access } = await import("node:fs/promises");
	await access(wasmPath);

	// Import the BUILT artifact, not the ts source.
	const distUrl = new URL("../dist/index.js", import.meta.url);
	const module = (await import(distUrl.href)) as {
		default: () => { extension: unknown; close(): Promise<void> };
	};
	expect(typeof module.default).toBe("function");

	const dir = await mkdtemp(join(tmpdir(), "sigrun-codemode-canary-"));
	try {
		const wiring = module.default();
		const faux = fauxProvider({
			provider: "faux",
			models: [{ id: "m", contextWindow: 128_000 }],
		});
		faux.setResponses([
			fauxAssistantMessage(
				fauxToolCall(
					"codemode",
					{ code: "return 1 + 1;" },
					{ id: "canary-1" },
				),
				{ stopReason: "toolUse" },
			),
			fauxAssistantMessage("done"),
		]);
		const models = createModels();
		models.setProvider(faux.provider);
		const defaultModel: ModelRef = { provider: "faux", modelId: "m" };
		const registry = createRegistry();
		registry.install(wiring.extension as never);
		const harness = await Harness.open(
			await openNodeSqliteStorage(join(dir, "sigrun.db")),
			{ models, registry },
			BACKGROUND_CONTEXT,
		);
		harness.resume();
		try {
			const root = await harness.root(BACKGROUND_CONTEXT, {
				agent: { model: defaultModel },
			});
			const submission = await root.submit(
				{ type: "input", content: "run the canary" },
				BACKGROUND_CONTEXT,
			);
			const settled = await submission.wait(BACKGROUND_CONTEXT);
			expect(settled.status).toBe("done");
			await root.waitForIdle(BACKGROUND_CONTEXT);
			const page = await root.entries({}, 50, undefined, BACKGROUND_CONTEXT);
			const transcript = JSON.stringify(page.items);
			expect(transcript).toContain("Script completed");
			expect(transcript).toContain("2");
		} finally {
			await harness.close(BACKGROUND_CONTEXT).catch(() => undefined);
			await wiring.close().catch(() => undefined);
		}
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}, 60_000);