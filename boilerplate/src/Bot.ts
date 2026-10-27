import { dirname, join } from "path";
import { fileURLToPath } from "url";
import AutoWA, { phoneToJid, setCredentialsDir, type IWAutoMessage } from "whatsauto.js";
import type { BotConfig } from "./config.js";
import type { Command, Context } from "./core/Command.js";
import { coreTexts, format, isLang, type Lang, type Vars } from "./core/i18n.js";
import { Registry } from "./core/Registry.js";
import { Sessions } from "./core/Sessions.js";
import { JsonStore } from "./core/Store.js";

const COMMANDS_DIR = join(dirname(fileURLToPath(import.meta.url)), "commands");
const CANCEL_WORDS = ["cancel", "batal"];

export interface UserData {
  lang?: Lang;
}

/**
 * Handles messages that are not commands (games, auto replies, ...).
 * Return `true` when the message was consumed, so command routing stops.
 */
export type Interceptor = (msg: IWAutoMessage, bot: Bot) => Promise<boolean | void> | boolean | void;

interface ParsedCommand {
  alias: string;
  args: string[];
  prefixed: boolean;
}

export default class Bot {
  readonly client: AutoWA;
  readonly registry = new Registry();
  readonly users: JsonStore<UserData>;
  private sessions = new Sessions();
  private interceptors: Interceptor[] = [];
  private cooldowns = new Map<string, number>();
  private lidToPn = new Map<string, string>();
  private notifiedOwners = false;
  readonly startedAt = Date.now();

  constructor(readonly config: BotConfig) {
    setCredentialsDir(config.credentialsDir);
    this.client = new AutoWA(config.sessionId, {
      printQR: !config.pairingNumber,
      phoneNumber: config.pairingNumber,
    });
    this.users = new JsonStore<UserData>(join(config.dataDir, "users.json"), () => ({}));
  }

  /** Register a handler for non-command messages; runs after prefixed commands. */
  use(interceptor: Interceptor): this {
    this.interceptors.push(interceptor);
    return this;
  }

  async start(): Promise<void> {
    await this.registry.load(COMMANDS_DIR);
    console.info(`[bot] loaded ${this.registry.commands.length} commands`);

    this.client.on("pairing-code", (code) => console.info(`[bot] pairing code: ${code}`));
    this.client.on("connected", () => void this.notifyOwners());
    this.client.on("private-message-received", (msg) => void this.handle(msg));
    this.client.on("group-message-received", (msg) => void this.handle(msg));

    await this.client.initialize();
  }

  // ---------------------------------------------------------------- identity

  /**
   * Map a jid to the canonical user id (`<phone>@s.whatsapp.net`).
   * Baileys v7 may address users by `@lid`; those are resolved through the LID mapping store.
   */
  async resolveUserId(jid?: string | null): Promise<string> {
    if (!jid) return "";
    if (!jid.endsWith("@lid")) {
      return jid.includes("@") && !jid.endsWith("@s.whatsapp.net") ? jid : phoneToJid({ from: jid });
    }

    const lid = phoneToJid({ from: jid });
    const cached = this.lidToPn.get(lid);
    if (cached) return cached;

    try {
      const pn = await this.client.sock?.signalRepository?.lidMapping?.getPNForLID(lid);
      if (pn) {
        const resolved = phoneToJid({ from: pn });
        this.lidToPn.set(lid, resolved);
        return resolved;
      }
    } catch (error) {
      console.error(`[bot] failed to resolve ${lid}:`, error);
    }
    return lid;
  }

  isOwner(user: string): boolean {
    return this.config.owners.some((owner) => phoneToJid({ from: owner }) === user);
  }

  async isGroupAdmin(group: string, user: string): Promise<boolean> {
    const { participants } = await this.client.sock.groupMetadata(group);
    for (const participant of participants) {
      if (!participant.admin) continue;
      const ids = [participant.id, participant.phoneNumber, participant.lid].filter(Boolean);
      for (const id of ids) {
        if ((await this.resolveUserId(id)) === user) return true;
      }
    }
    return false;
  }

  langOf(user: string): Lang {
    const lang = this.users.get(user).lang;
    return isLang(lang) ? lang : this.config.defaultLang;
  }

  // ----------------------------------------------------------------- routing

  parseCommand(text: string): ParsedCommand | null {
    let body = text.trim();
    const prefixed = this.config.prefixes.includes(body[0]);
    if (prefixed) body = body.slice(1).trimStart();
    else if (!this.config.prefixless) return null;

    const match = body.match(/^(\S+)\s*([\s\S]*)$/);
    if (!match) return null;
    const rest = match[2].trim();
    return {
      alias: match[1].toLowerCase(),
      args: rest ? rest.split("|").map((arg) => arg.trim()) : [],
      prefixed,
    };
  }

  async handle(msg: IWAutoMessage): Promise<void> {
    if (msg.key.fromMe || msg.message?.protocolMessage || msg.isReaction) return;

    try {
      msg.author = await this.resolveUserId(msg.author);
      if (msg.quotedMessage) {
        msg.quotedMessage.author = await this.resolveUserId(msg.quotedMessage.author);
      }

      const text = msg.text || "";
      const parsed = this.parseCommand(text);
      const command = parsed && this.registry.find(parsed.alias);

      const session = this.sessions.get(msg.from, msg.author);
      if (session && !(parsed?.prefixed && command)) {
        await this.continueSession(msg, session, text);
        return;
      }

      if (parsed?.prefixed && command) {
        await this.invoke(msg, command, parsed.alias, parsed.args);
        return;
      }

      for (const interceptor of this.interceptors) {
        if (await interceptor(msg, this)) return;
      }

      if (parsed && command) await this.invoke(msg, command, parsed.alias, parsed.args);
    } catch (error) {
      console.error("[bot] failed to handle message:", error);
      await this.safeReply(msg, this.t(this.langOf(msg.author), "error"));
    }
  }

  private async continueSession(
    msg: IWAutoMessage,
    session: NonNullable<ReturnType<Sessions["get"]>>,
    text: string,
  ) {
    const lang = this.langOf(msg.author);
    if (CANCEL_WORDS.includes(text.trim().toLowerCase())) {
      this.sessions.delete(msg.from, msg.author);
      await msg.replyWithText(this.t(lang, "session_cancelled"));
      return;
    }

    const command = this.registry.find(session.alias);
    if (!command) {
      this.sessions.delete(msg.from, msg.author);
      return;
    }

    const args = [...session.args];
    args[session.step] = text.trim();
    await this.run(msg, command, session.alias, args, session.params);
  }

  private async invoke(msg: IWAutoMessage, command: Command, alias: string, args: string[]) {
    const user = msg.author;
    const lang = this.langOf(user);
    const deny = (key: string, vars?: Vars) => msg.replyWithText(this.t(lang, key, vars, command));

    if (command.ownerOnly && !this.isOwner(user)) return void (await deny("owner_only"));
    if ((command.groupOnly || command.groupAdminOnly) && !msg.isGroup) return void (await deny("group_only"));
    if (command.privateOnly && msg.isGroup) return void (await deny("private_only"));
    if (command.groupAdminOnly && !this.isOwner(user) && !(await this.isGroupAdmin(msg.from, user))) {
      return void (await deny("group_admin_only"));
    }

    const wait = (this.cooldowns.get(`${alias}|${user}`) ?? 0) - Date.now();
    if (wait > 0) return void (await deny("cooldown", { seconds: Math.ceil(wait / 1000) }));

    await this.run(msg, command, alias, args, {});
  }

  /** Collect parameters (asking for missing ones), then execute the command. */
  private async run(
    msg: IWAutoMessage,
    command: Command,
    alias: string,
    args: string[],
    collected: Record<string, unknown>,
  ) {
    const ctx = this.createContext(msg, command, alias, args, collected);

    for (const [index, param] of command.params.entries()) {
      if (param.name in collected) continue;

      const raw = args[index]?.trim() ?? "";
      if (raw) {
        const value = param.parse ? param.parse(raw, ctx) : raw;
        if (value !== undefined) {
          collected[param.name] = value;
          continue;
        }
        await ctx.reply(ctx.t("invalid_param", { param: param.name }));
      } else if (param.required === false) {
        continue;
      }

      this.sessions.set(msg.from, msg.author, { alias, args, params: collected, step: index });
      await ctx.reply(ctx.t("session_prompt", { prompt: format(param.prompt, ctx.lang) }));
      return;
    }

    this.sessions.delete(msg.from, msg.author);
    await msg.replyWithTyping(async () => {
      if ((await command.execute(ctx)) === false) return;
      if (command.cooldown > 0) {
        this.cooldowns.set(`${alias}|${msg.author}`, Date.now() + command.cooldown * 1000);
      }
    });
  }

  private createContext(
    msg: IWAutoMessage,
    command: Command,
    alias: string,
    args: string[],
    params: Record<string, unknown>,
  ): Context {
    const lang = this.langOf(msg.author);
    return {
      bot: this,
      msg,
      alias,
      args,
      params,
      user: msg.author,
      lang,
      t: (key, vars) => this.t(lang, key, vars, command),
      reply: (text) => msg.replyWithText(text),
    };
  }

  t(lang: Lang, key: string, vars?: Vars, command?: Command): string {
    const text = command?.texts[key] ?? coreTexts[key];
    return text === undefined ? key : format(text, lang, vars);
  }

  get prefix(): string {
    return this.config.prefixes[0] ?? "";
  }

  // ------------------------------------------------------------------ helpers

  private async safeReply(msg: IWAutoMessage, text: string) {
    try {
      await msg.replyWithText(text);
    } catch (error) {
      console.error("[bot] failed to send reply:", error);
    }
  }

  private async notifyOwners() {
    if (this.notifiedOwners) return;
    this.notifiedOwners = true;
    for (const owner of this.config.owners) {
      try {
        await this.client.sendText({ to: owner, text: `${this.config.name} is online ✅` });
      } catch (error) {
        console.error(`[bot] failed to notify owner ${owner}:`, error);
      }
    }
  }
}
