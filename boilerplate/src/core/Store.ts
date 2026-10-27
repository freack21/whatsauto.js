import { readJson, writeJsonAtomic } from "./json.js";

/**
 * A small JSON-file key/value store: loaded once, cached in memory and
 * written atomically on every change.
 */
export class JsonStore<T extends object> {
  private data: Record<string, T>;

  constructor(
    private path: string,
    private defaults: () => T,
  ) {
    this.data = readJson<Record<string, T>>(path, {});
  }

  get(key: string): T {
    return { ...this.defaults(), ...this.data[key] };
  }

  has(key: string): boolean {
    return key in this.data;
  }

  update(key: string, patch: Partial<T>): T {
    const value = { ...this.get(key), ...patch };
    this.data[key] = value;
    writeJsonAtomic(this.path, this.data);
    return value;
  }

  delete(key: string): void {
    if (!(key in this.data)) return;
    delete this.data[key];
    writeJsonAtomic(this.path, this.data);
  }

  keys(): string[] {
    return Object.keys(this.data);
  }
}
