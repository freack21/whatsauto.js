import path from "path";
import fs from "fs";
import { AutoWA } from "./AutoWA.js";
import { CREDENTIALS } from "../Defaults/index.js";

export * from "./AutoWA.js";

export const sessions: Map<string, AutoWA> = new Map();

export const session = (sessionId: string) => sessions.get(sessionId);

export const sessionsList = () => Array.from(sessions.keys());

export async function deleteSession(sessionId: string) {
  const session = sessions.get(sessionId);

  if (!session) return false;

  try {
    await session.destroy(true);
    return true;
  } catch (error) {
    return false;
  }
}

export async function deleteAllSessions() {
  for (const sessionId of sessionsList()) {
    await deleteSession(sessionId);
  }
}

const getSessionDirNames = () => {
  const dir = path.resolve(CREDENTIALS.DIR_NAME);

  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((file) => file.isDirectory() && file.name.endsWith(CREDENTIALS.PREFIX))
    .map((file) => file.name.slice(0, -CREDENTIALS.PREFIX.length))
    .filter((sessionId) => sessionId !== "");
};

export async function loadSessionNames() {
  return getSessionDirNames();
}

export async function loadSessions() {
  for (const sessionId of getSessionDirNames()) {
    if (sessions.has(sessionId)) continue;

    let client: AutoWA | undefined;
    try {
      client = new AutoWA(sessionId);
      await client.initialize();
    } catch (error) {
      const msg = `Failed load session: ${(error as Error).message}`;
      if (client) {
        client.logger.error(msg);
        if (sessions.get(sessionId) === client) sessions.delete(sessionId);
      } else console.error(`[${sessionId}] ${msg}`);
    }
  }
}

export default AutoWA;
