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

export async function loadSessionNames() {
  const dir = path.resolve(CREDENTIALS.DIR_NAME);

  if (!fs.existsSync(dir)) return [];

  const files = fs.readdirSync(dir);

  return files.map((file) => file.replace(CREDENTIALS.PREFIX, ""));
}

export async function loadSessions() {
  const dir = path.resolve(CREDENTIALS.DIR_NAME);

  if (!fs.existsSync(dir)) return;

  const files = fs.readdirSync(dir);

  for (const file of files) {
    const sessionId = file.replace(CREDENTIALS.PREFIX, "");
    const client = new AutoWA(sessionId);
    await client.initialize();
    sessions.set(sessionId, client);
  }
}

export default AutoWA;
