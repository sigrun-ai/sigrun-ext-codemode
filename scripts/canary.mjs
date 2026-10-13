#!/usr/bin/env node
/**
 * The in-image boot canary (sigrun Task 8): the plain-node twin of
 * test/canary.spec.ts, executed by the sigrun image's entry script
 * (scripts/docker-entry.sh in the sigrun repo) against the VENDORED dists
 * BEFORE the server starts.
 *
 * Proves the whole runtime chain resolves inside the deployed image: the
 * package's default export, the factory, the codemode tool, and (critically)
 * `quickjs-wasi/quickjs.wasm` on disk — whose absence would otherwise
 * surface only as a 500 on the first real script in prod. Any failure
 * exits 1 (fail loud: boot smoke, not build smoke).
 *
 * Runs from the package's scripts/ dir; bare imports resolve by walking up
 * to the enclosing install root (the sigrun image symlinks
 * node_modules/sigrun-ext-codemode at .docker-ext/sigrun-ext-codemode,
 * whose dependencies are hoisted at the image root).
 */

import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import process from "node:process";

/** Record the failure and unwind (exit code 1 once the loop drains). */
function fail(message) {
	process.exitCode = 1;
	throw new Error(message);
}

const timer = setTimeout(() => {
	console.error("canary: FAIL timed out after 60s");
	process.exit(1);
}, 60_000);

try {
	// The wasm file must resolve from THIS package's tree (a re-pinned
	// transitive quickjs-wasi strands it). Assert it explicitly before
	// running anything.
	const require = createRequire(import.meta.url);
	const wasmPath = require.resolve("quickjs-wasi/quickjs.wasm");
	await access(wasmPath);

	// Import the BUILT artifact, not the ts source.
	const distUrl = new URL("../dist/index.js", import.meta.url);
	const module = await import(distUrl.href);
	if (typeof module.default !== "function") {
		fail("built dist default export is not a function");
	}

	const { BACKGROUND_CONTEXT } = await import("@earendil-works/chord/context");
	const {
		fauxAssistantMessage,
		fauxProvider,
		fauxToolCall,
	} = await import("@earendil-works/pi-ai/providers/faux");
	const { createModels } = await import("@earendil-works/pi-ai/models");
	const {
		createRegistry,
		Harness,
	} = await import("@earendil-works/pi-durable");
	const { openNodeSqliteStorage } = await import(
		"@earendil-works/pi-durable/storage/sqlite/node"
	);

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
		const defaultModel = { provider: "faux", modelId: "m" };
		const registry = createRegistry();
		registry.install(wiring.extension);
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
			if (settled.status !== "done") {
				fail(`submission settled ${String(settled.status)}, expected done`);
			}
			await root.waitForIdle(BACKGROUND_CONTEXT);
			const page = await root.entries({}, 50, undefined, BACKGROUND_CONTEXT);
			const transcript = JSON.stringify(page.items);
			if (!transcript.includes("Script completed")) {
				fail("transcript lacks 'Script completed'");
			}
			if (!transcript.includes("2")) {
				fail("transcript lacks the script result '2'");
			}
			const rss = process.memoryUsage().rss;
			console.log(
				`canary: OK — quickjs wasm resolved, \`return 1+1\` ran in-image, transcript verified (rss ${Math.round(rss / 1024 / 1024)} MiB)`,
			);
		} finally {
			await harness.close(BACKGROUND_CONTEXT).catch(() => undefined);
			await wiring.close().catch(() => undefined);
		}
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
} catch (error) {
	console.error(`canary: FAIL ${error?.stack ?? String(error)}`);
} finally {
	clearTimeout(timer);
}
