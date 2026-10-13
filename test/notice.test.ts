/**
 * The warn-if-not-offered channel (the spec's corrected mechanism): when
 * the codemode TOOL is installed but not model-offered in a request
 * (`agent.modelTools` removes it, as Settings → default tools would),
 * the companion `codemode_notice` section renders the enable notice;
 * when offered, it renders NOTHING (undefined — no tag, no prompt text),
 * leaving upstream's `codemode` section as the only render. The tool
 * stays REGISTERED (installed) after removal — only the model-offer set
 * narrows — so "installed but not offered" is exactly the state the
 * notice targets.
 */

import { expect, test } from "vitest";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
	cleanupDir,
	closeOpened,
	openCodemodeHarness,
	tempDir,
} from "./harness.js";
import { MCP_CONFIG_ENV } from "../src/config.js";
import {
	CODEMODE_NOTICE_SECTION_KEY,
	CODEMODE_NOT_OFFERED_NOTICE,
} from "../src/extension.js";
import type { Agent, Harness, PromptInput } from "@earendil-works/pi-durable";

/** Render the notice section for a conversation's current agent. */
async function renderNotice(
	harness: Harness,
	conversationId: Awaited<ReturnType<Harness["root"]>>["id"],
	agent: Agent,
): Promise<string | undefined> {
	const section = agent.sections.find(
		(candidate) => candidate.key === CODEMODE_NOTICE_SECTION_KEY,
	);
	if (section === undefined) return "section-missing";
	const input = {
		conversationId,
		agent,
		env: undefined,
		shown: {},
		read: undefined as never,
	} satisfies PromptInput;
	return await Promise.resolve(section.render(input, BACKGROUND_CONTEXT));
}

test("with codemode model-offered the notice renders nothing; with it removed the notice renders", async () => {
	const dir = await tempDir("sigrun-codemode-notice-");
	try {
		const opened = await openCodemodeHarness(dir);
		try {
			const root = await opened.harness.root(BACKGROUND_CONTEXT, {});
			let agent = await root.agent(BACKGROUND_CONTEXT);
			// Offered: agent.tools holds codemode; the notice renders nothing.
			expect(agent.tools.map((tool) => tool.name)).toContain("codemode");
			expect(await renderNotice(opened.harness, root.id, agent)).toBeUndefined();

			// Settings-shaped removal: modelTools removes the codemode tool
			// (never widens; other callers can still call it).
			const codemodeTool = agent.tools.find(
				(tool) => tool.name === "codemode",
			)!;
			await root.configure(
				{ modelTools: { remove: [codemodeTool] } },
				BACKGROUND_CONTEXT,
			);
			agent = await root.agent(BACKGROUND_CONTEXT);
			expect(agent.tools.map((tool) => tool.name)).not.toContain("codemode");
			// Still registered (installed): only the model-offer set narrowed.
			const notice = await renderNotice(opened.harness, root.id, agent);
			expect(notice).toBe(CODEMODE_NOT_OFFERED_NOTICE);

			// Re-offering silences the notice again (de-dup by construction).
			await root.configure(
				{ modelTools: { remove: [] } },
				BACKGROUND_CONTEXT,
			);
			agent = await root.agent(BACKGROUND_CONTEXT);
			expect(agent.tools.map((tool) => tool.name)).toContain("codemode");
			expect(await renderNotice(opened.harness, root.id, agent)).toBeUndefined();
		} finally {
			await closeOpened(opened);
		}
	} finally {
		await cleanupDir(dir);
	}
});