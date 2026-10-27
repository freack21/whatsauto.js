/** A command waiting for the user to supply its missing parameters. */
export interface Session {
  alias: string;
  args: string[];
  params: Record<string, unknown>;
  /** Index of the parameter currently being asked for. */
  step: number;
  expiresAt: number;
}

/** In-memory interactive sessions, keyed by chat and user, with a time-to-live. */
export class Sessions {
  private sessions = new Map<string, Session>();

  constructor(private ttlMs = 5 * 60 * 1000) {}

  private key(chat: string, user: string) {
    return `${chat}|${user}`;
  }

  get(chat: string, user: string): Session | undefined {
    const key = this.key(chat, user);
    const session = this.sessions.get(key);
    if (session && session.expiresAt <= Date.now()) {
      this.sessions.delete(key);
      return undefined;
    }
    return session;
  }

  set(chat: string, user: string, session: Omit<Session, "expiresAt">): void {
    this.sessions.set(this.key(chat, user), { ...session, expiresAt: Date.now() + this.ttlMs });
  }

  delete(chat: string, user: string): void {
    this.sessions.delete(this.key(chat, user));
  }
}
