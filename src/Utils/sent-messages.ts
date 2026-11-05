import type { WAMessage, proto } from "@whiskeysockets/baileys";

/**
 * The messages this session sent recently, for Baileys' `getMessage`. When another device of
 * the account (or the recipient) fails to decrypt a message it asks for it again; Baileys only
 * keeps its own copy for 5 minutes and in memory, so without this a late retry is never answered.
 */
export class SentMessages {
  private messages = new Map<string, { message: proto.IMessage; at: number }>();

  constructor(
    private readonly maxEntries = 2000,
    private readonly ttlMs = 24 * 60 * 60 * 1000
  ) {}

  /** Remember an outgoing message (others are ignored). */
  remember(msg: WAMessage) {
    const id = msg.key?.id;
    if (!id || !msg.key?.fromMe || !msg.message) return;
    this.messages.delete(id); // keeps Map order = age order
    this.messages.set(id, { message: msg.message, at: Date.now() });
    this.prune();
  }

  /** The `getMessage` callback of the socket config. */
  get = async (key: { id?: string | null }): Promise<proto.IMessage | undefined> => {
    const entry = key.id ? this.messages.get(key.id) : undefined;
    if (!entry) return undefined;
    if (Date.now() - entry.at > this.ttlMs) {
      this.messages.delete(key.id!);
      return undefined;
    }
    return entry.message;
  };

  get size() {
    return this.messages.size;
  }

  private prune() {
    const oldest = Date.now() - this.ttlMs;
    for (const [id, entry] of this.messages) {
      if (this.messages.size <= this.maxEntries && entry.at >= oldest) break;
      this.messages.delete(id);
    }
  }
}
