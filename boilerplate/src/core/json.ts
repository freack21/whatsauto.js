import fs from "fs";
import { dirname } from "path";

/**
 * Read a JSON file. Returns `fallback` when the file does not exist or is empty.
 * A file that exists but cannot be parsed throws instead of being silently reset,
 * so user data is never overwritten by accident.
 */
export function readJson<T>(path: string, fallback: T): T {
  if (!fs.existsSync(path)) return fallback;

  const raw = fs.readFileSync(path, "utf-8");
  if (!raw.trim()) return fallback;

  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    throw new Error(`Corrupt JSON in ${path}; fix or remove the file`, { cause: error });
  }
}

/** Write JSON atomically (temp file + rename), so a crash never leaves a truncated file. */
export function writeJsonAtomic(path: string, data: unknown): void {
  fs.mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, path);
}
