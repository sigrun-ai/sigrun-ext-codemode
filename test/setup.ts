/** Suite-wide hermetic config root: no test may read the developer's MCP config. */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.SIGRUN_CONFIG_DIR = mkdtempSync(
	join(tmpdir(), "sigrun-ext-codemode-vitest-config-"),
);
