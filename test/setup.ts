/** Suite-wide hermetic config root: no test may read the developer's MCP config. */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const configDir = mkdtempSync(join(tmpdir(), "sigrun-ext-codemode-vitest-config-"));
process.env.SIGRUN_CONFIG_DIR = configDir;
process.env.SIGRUN_MCP_CONFIG = join(configDir, "no-legacy-mcp.json");
