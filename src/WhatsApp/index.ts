import path from "path";
import fs from "fs";
import { AutoWA } from "./AutoWA.js";
import { CREDENTIALS } from "../Defaults/index.js";

export * from "./AutoWA.js";

export const sessions: Map<string, AutoWA> = new Map();

export const session = (sessionId: string) => sessions.get(sessionId);

export const sessionsList = () => Array.from(sessions.keys());

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
