import fs from "fs";
import path from "path";
import { BufferJSON, initAuthCreds, proto } from "@whiskeysockets/baileys";
import type { AuthenticationState, SignalDataTypeMap } from "@whiskeysockets/baileys";

/**
 * Multi-file auth state like Baileys' `useMultiFileAuthState` (same folder and file layout, so
 * existing sessions keep working), but safe against a process that dies while saving:
 *
 * - every file is written to a temporary file, flushed and renamed over the target, so a file is
 *   always either the old or the new content, never a truncated one;
 * - writes to the same file are serialized;
 * - a file that can't be parsed is reported through `onWarn` (Baileys silently treats it as
 *   missing, which breaks the encryption session and shows up as "Bad MAC" / "failed to decrypt");
 * - `creds.json` keeps a `creds.json.bak` of the last good copy and falls back to it, so one bad
 *   file doesn't turn into a new identity and a new QR code.
 */
export async function useAtomicAuthState(
  folder: string,
  onWarn: (message: string) => void = () => {}
): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> {
  const stat = await fs.promises.stat(folder).catch(() => undefined);
  if (stat && !stat.isDirectory()) {
    throw new Error(`found something that is not a directory at ${folder}, either delete it or specify a different location`);
  }
  await fs.promises.mkdir(folder, { recursive: true });
  // temporary files left by a process killed mid-write
  for (const name of await fs.promises.readdir(folder).catch(() => [] as string[])) {
    if (name.endsWith(".tmp")) await fs.promises.rm(path.join(folder, name), { force: true });
  }

  const fixFileName = (file: string) => file.replace(/\//g, "__").replace(/:/g, "-");
  const locks = new Map<string, Promise<unknown>>();
  const locked = <T>(file: string, task: () => Promise<T>): Promise<T> => {
    const run = (locks.get(file) ?? Promise.resolve()).then(task, task);
    const tail = run.catch(() => undefined);
    locks.set(file, tail);
    tail.then(() => locks.get(file) === tail && locks.delete(file));
    return run;
  };

  let tmpCounter = 0;
  const atomicWrite = async (filePath: string, content: string) => {
    const tmp = `${filePath}.${process.pid}.${++tmpCounter}.tmp`;
    const handle = await fs.promises.open(tmp, "w");
    try {
      await handle.writeFile(content);
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await fs.promises.rename(tmp, filePath);
    } catch (error) {
      await fs.promises.rm(tmp, { force: true });
      throw error;
    }
  };

  const parse = (text: string) => JSON.parse(text, BufferJSON.reviver);

  const readFile = async (filePath: string): Promise<string | undefined> => {
    try {
      return await fs.promises.readFile(filePath, "utf-8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        onWarn(`cannot read ${path.basename(filePath)}: ${(error as Error).message}`);
      }
      return undefined;
    }
  };

  const readData = (file: string) =>
    locked(file, async () => {
      const filePath = path.join(folder, fixFileName(file));
      const text = await readFile(filePath);
      if (text !== undefined) {
        try {
          return parse(text);
        } catch {
          onWarn(`${path.basename(filePath)} is corrupted and was ignored`);
        }
      }
      if (file === "creds.json") {
        const backup = await readFile(`${filePath}.bak`);
        if (backup !== undefined) {
          try {
            const creds = parse(backup);
            onWarn("creds.json restored from creds.json.bak");
            return creds;
          } catch {
            onWarn("creds.json.bak is corrupted and was ignored");
          }
        }
      }
      return null;
    });

  const writeData = (data: unknown, file: string) =>
    locked(file, async () => {
      const filePath = path.join(folder, fixFileName(file));
      if (file === "creds.json") {
        // keep the previous copy, but only when it is a good one
        const previous = await readFile(filePath);
        if (previous !== undefined) {
          try {
            parse(previous);
            await atomicWrite(`${filePath}.bak`, previous);
          } catch {
            // the current file is bad: keep the older, good backup
          }
        }
      }
      await atomicWrite(filePath, JSON.stringify(data, BufferJSON.replacer));
    });

  const removeData = (file: string) =>
    locked(file, async () => {
      await fs.promises.rm(path.join(folder, fixFileName(file)), { force: true }).catch(() => {});
    });

  const creds = (await readData("creds.json")) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
          const data: { [id: string]: SignalDataTypeMap[T] } = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await readData(`${type}-${id}.json`);
              if (type === "app-state-sync-key" && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              }
              data[id] = value;
            })
          );
          return data;
        },
        set: async (data) => {
          const tasks: Promise<unknown>[] = [];
          for (const category in data) {
            const entries = data[category as keyof SignalDataTypeMap] ?? {};
            for (const id in entries) {
              const value = entries[id];
              const file = `${category}-${id}.json`;
              tasks.push(value ? writeData(value, file) : removeData(file));
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: () => writeData(creds, "creds.json"),
  };
}
