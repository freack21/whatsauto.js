import path from "path";
import { CREDENTIALS } from "../Defaults";
import { AutoWA } from "./AutoWA";
import fs from "fs";

export class AutoWAManager {
  private sessions: Map<string, AutoWA>;

  public addSessions(autoWAs: AutoWA[]) {
    for (const autoWA of autoWAs) {
      this.addSession(autoWA);
    }
  }

  public addSession(autoWA: AutoWA) {
    this.sessions.set(autoWA.sessionId, autoWA);
  }

  public isSessionExist(sessionId: string) {
    if (
      fs.existsSync(path.resolve(CREDENTIALS.DIR_NAME)) &&
      fs.existsSync(path.resolve(CREDENTIALS.DIR_NAME, sessionId + CREDENTIALS.PREFIX)) &&
      fs.readdirSync(path.resolve(CREDENTIALS.DIR_NAME, sessionId + CREDENTIALS.PREFIX)).length
    ) {
      return true;
    }
    return false;
  }

  public async startSessions() {
    for (const session of this.getSessions()) {
      const { sessionId, options } = this.getSession(session);

      const autoWA = new AutoWA(sessionId, options, this);
      await autoWA.initialize();
    }
  }

  public async deleteSession(sessionId: string) {
    const session = this.getSession(sessionId);
    try {
      await session?.logout();
    } catch (error) {}
    session?.end();
    this.sessions.delete(sessionId);
    const dir = path.resolve(CREDENTIALS.DIR_NAME, sessionId + CREDENTIALS.PREFIX);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { force: true, recursive: true });
    }
  }

  public getSessions() {
    return Array.from(this.sessions.keys());
  }

  public getSession(sessionId: string) {
    return this.sessions.get(sessionId);
  }
}
