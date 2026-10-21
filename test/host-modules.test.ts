/**
 * Single-copy host-module contract (mirrors sigrun's
 * test/host-modules.test.ts): pi-codemode and pi-durable pin their
 * @earendil-works family exactly (1.3.0), and a nested second copy under
 * node_modules is the silent identity-skew class sigrun's loader guard
 * exists to catch. Walks the installed tree directly — no `npm ls` shell-out:
 * the contract is what is on disk.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

/** The host modules this extension shares with the sigrun host. */
const HOST_MODULES = [
	"@earendil-works/pi-codemode",
	"@earendil-works/pi-durable",
] as const;

/** `stat` as an existence check (no throw on missing). */
async function exists(path: string): Promise<boolean> {
	return stat(path).then(
		() => true,
		() => false,
	);
}

/**
 * Every installed copy of `moduleName`'s package.json in this repo's
 * node_modules tree, nested copies included.
 */
async function installedCopies(moduleName: string): Promise<string[]> {
	const queue: string[] = [join(REPO_ROOT, "node_modules")];
	const found: string[] = [];
	const seen = new Set<string>();
	while (queue.length > 0) {
		const modulesDir = queue.shift();
		if (modulesDir === undefined || seen.has(modulesDir)) continue;
		seen.add(modulesDir);

		const manifest = join(modulesDir, moduleName, "package.json");
		if (await exists(manifest)) found.push(manifest);

		// Enqueue nested installs inside every package directory here
		// (scoped packages one level deeper, through `@scope/name`).
		const packageDirs: string[] = [];
		for (const item of await readdir(modulesDir, { withFileTypes: true })) {
			if (!item.isDirectory()) continue;
			if (item.name.startsWith("@")) {
				for (const scoped of await readdir(join(modulesDir, item.name), {
					withFileTypes: true,
				})) {
					if (scoped.isDirectory())
						packageDirs.push(join(modulesDir, item.name, scoped.name));
				}
			} else {
				packageDirs.push(join(modulesDir, item.name));
			}
		}
		for (const packageDir of packageDirs) {
			const nested = join(packageDir, "node_modules");
			if (await exists(nested)) queue.push(nested);
		}
	}
	return found;
}

test("exactly one installed copy of each @earendil-works host module", async () => {
	for (const moduleName of HOST_MODULES) {
		const copies = await installedCopies(moduleName);
		expect(
			copies,
			`${moduleName} must resolve to exactly one installed copy (nested duplicates are the silent identity-skew class the loader guard exists for)`,
		).toHaveLength(1);
	}
});

test("the @earendil-works host modules are installed at 1.3.0", async () => {
	for (const moduleName of HOST_MODULES) {
		const copies = await installedCopies(moduleName);
		expect(copies.length, moduleName).toBeGreaterThan(0);
		for (const manifest of copies) {
			const pkg = JSON.parse(await readFile(manifest, "utf8")) as {
				version: string;
			};
			expect(pkg.version, manifest).toBe("1.3.0");
		}
	}
});
