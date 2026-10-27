// Run only the repository's node:test suites (test/*.test.mjs).
// `node --test` without arguments would also pick up stray *.test.ts files on
// Node >= 22.18 (type stripping), and shell globs don't expand on Windows.
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const testDir = join(dirname(fileURLToPath(import.meta.url)), "..", "test");
const files = readdirSync(testDir)
  .filter((file) => file.endsWith(".test.mjs"))
  .sort()
  .map((file) => join(testDir, file));

if (!files.length) {
  console.error(`No test files found in ${testDir}`);
  process.exit(1);
}

const { status, error } = spawnSync(process.execPath, ["--test", ...files], { stdio: "inherit" });
if (error) throw error;
process.exit(status ?? 1);
