// Compare the installed and declared whatsauto.js with the latest npm release.
// Always exits 0 so it can be used from hooks or CI without failing them.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const pkg = "whatsauto.js";
const read = (path) => {
  try {
    return JSON.parse(readFileSync(new URL(path, import.meta.url), "utf-8"));
  } catch {
    return {};
  }
};

const installed = read(`../node_modules/${pkg}/package.json`).version ?? "not installed";
const declared = read("../package.json").dependencies?.[pkg] ?? "unknown";
let latest = "unknown";
try {
  latest = execFileSync("npm", ["view", pkg, "dist-tags.latest", "--prefer-online"], {
    encoding: "utf-8",
    shell: process.platform === "win32",
    timeout: 20000,
  }).trim();
} catch {}

if (latest === "unknown") {
  console.log(`[${pkg}] latest version could not be fetched (installed: ${installed}, declared: ${declared}).`);
} else if (installed === latest && declared === `^${latest}`) {
  console.log(`[${pkg}] up to date: ${latest}.`);
} else {
  console.log(
    `[${pkg}] UPDATE AVAILABLE: latest ${latest}, installed ${installed}, declared ${declared}. ` +
      `Run: npm install ${pkg}@latest, then npm run typecheck && npm test.`,
  );
}
