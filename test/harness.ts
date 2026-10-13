/**
 * Shared test harness: opens a REAL pi-durable Harness (registry + faux
 * provider) with the sigrun-ext-codemode extension installed — the same
 * shape as sigrun-ext-mcp's harness tests, no sigrun-core dependency.
 *
 * The environment is a NodeExecutionEnv rooted at a temp workspace dir,
 * so scripts calling `tools.read` read real files (the full pipeline:
 * api.executeTool → nested ToolTask → the read tool's env).
 */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeExecutionEnv } from "@earendil-works/pi-durable/env/node";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
	fauxAssistantMessage,
	fauxProvider,
} from "@earendil-works/pi-ai/providers/faux";
import { createModels } from "@earendil-works/pi-ai/models";
import { CodingTools } from "@earendil-works/pi-durable/tools";
import {
	createRegistry,
	Harness,
	type ModelRef,
} from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { MCP_CONFIG_ENV } from "../src/config.js";
import { createCodemodeWiring } from "../src/index.js";

/** Configure the factory's config store via the env override. */
export function stubConfigPath(dir: string): string {
	return join(dir, "mcp.json");
}

export interface OpenedHarness {
	readonly harness: Harness;
	readonly defaultModel: ModelRef;
	readonly wiring: ReturnType<typeof createCodemodeWiring>;
	readonly registry: ReturnType<typeof createRegistry>;
	readonly workspace: string;
}

/**
 * Open a real pi-durable harness with the codemode extension installed.
 * The workspace is a real temp dir the read tool sees via the env.
 */
export async function openCodemodeHarness(
	dir: string,
	responses: Parameters<
		ReturnType<typeof fauxProvider>["setResponses"]
	>[0] = [fauxAssistantMessage("no tools needed")],
): Promise<OpenedHarness> {
	const workspace = join(dir, "workspace");
	await mkdir(workspace, { recursive: true });
	await writeFile(join(workspace, "note.txt"), "sigrun codemode says hi");

	// The factory reads the config path from the env override at factory
	// time (the snapshot), so the override must be set around the call.
	const prior = process.env[MCP_CONFIG_ENV];
	process.env[MCP_CONFIG_ENV] = stubConfigPath(dir);
	let wiring: ReturnType<typeof createCodemodeWiring>;
	try {
		wiring = createCodemodeWiring();
	} finally {
		if (prior === undefined) delete process.env[MCP_CONFIG_ENV];
		else process.env[MCP_CONFIG_ENV] = prior;
	}

	const faux = fauxProvider({
		provider: "faux",
		models: [{ id: "m", contextWindow: 128_000 }],
	});
	faux.setResponses(responses);
	const models = createModels();
	models.setProvider(faux.provider);
	const defaultModel: ModelRef = { provider: "faux", modelId: "m" };

	const registry = createRegistry();
	registry.install(wiring.extension);
	// The read tool (CodingTools: read, write, edit, bash) — scripts call
	// `tools.read`; the model can also call them directly.
	registry.install(CodingTools);

	const harness = await Harness.open(
		await openNodeSqliteStorage(join(dir, "sigrun.db")),
		{
			models,
			registry,
			env: () => new NodeExecutionEnv({ cwd: workspace }),
		},
		BACKGROUND_CONTEXT,
	);
	harness.resume();
	return { harness, defaultModel, wiring, registry, workspace };
}

/** Fresh temp dir; the test body receives it and must clean up. */
export async function tempDir(prefix: string): Promise<string> {
	return mkdtemp(join(tmpdir(), prefix));
}

export async function cleanupDir(dir: string): Promise<void> {
	await rm(dir, { recursive: true, force: true });
}

/** Close an opened harness and its sandbox; safe in test finally blocks. */
export async function closeOpened(opened: OpenedHarness): Promise<void> {
	await opened.harness.close(BACKGROUND_CONTEXT).catch(() => undefined);
	await opened.wiring.close().catch(() => undefined);
}