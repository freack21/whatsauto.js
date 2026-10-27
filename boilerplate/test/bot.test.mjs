import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import Bot from "../dist/Bot.js";
import { loadConfig } from "../dist/config.js";
import { Command } from "../dist/core/Command.js";
import { JsonStore } from "../dist/core/Store.js";
import { format } from "../dist/core/i18n.js";

const OWNER = "6281111111111";
const OWNER_JID = `${OWNER}@s.whatsapp.net`;
const USER_JID = "6282222222222@s.whatsapp.net";
const GROUP = "120363000000000000@g.us";

let tmp;
let counter = 0;

before(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wa-bot-test-"));
});
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

async function createBot(env = {}) {
  const dir = path.join(tmp, `bot-${++counter}`);
  const bot = new Bot(
    loadConfig({
      SESSION_ID: `test-${counter}`,
      CREDENTIALS_DIR: path.join(dir, "creds"),
      DATA_DIR: path.join(dir, "data"),
      OWNER_NUMBERS: OWNER,
      PREFIXES: "!.",
      DEFAULT_LANG: "en",
      ...env,
    }),
  );
  bot.client.sock = {
    signalRepository: {
      lidMapping: { getPNForLID: async (lid) => (lid === "999@lid" ? `${OWNER}:3@s.whatsapp.net` : null) },
    },
    groupMetadata: async () => ({
      participants: [
        { id: "999@lid", admin: "admin" },
        { id: "555@lid", phoneNumber: USER_JID, admin: null },
      ],
    }),
  };
  bot.client.sendText = async (opts) => {
    bot.sent.push(opts);
  };
  bot.sent = [];
  await bot.registry.load(path.resolve("dist/commands"));
  return bot;
}

function message(text, { author = USER_JID, from, group = false, fromMe = false, extra = {} } = {}) {
  const replies = [];
  const msg = {
    key: { id: `m${Math.random()}`, fromMe, remoteJid: from ?? (group ? GROUP : author) },
    message: { conversation: text },
    messageTimestamp: Math.floor(Date.now() / 1000),
    text,
    author,
    from: from ?? (group ? GROUP : author),
    isGroup: group,
    isReaction: false,
    replies,
    replyWithText: async (t) => void replies.push(t),
    replyWithTyping: async (cb) => cb(),
    ...extra,
  };
  return msg;
}

describe("config and helpers", () => {
  test("loadConfig parses lists and flags", () => {
    const config = loadConfig({ OWNER_NUMBERS: " 1, 2 ,", PREFIXES: "! .", PREFIXLESS: "true", DEFAULT_LANG: "xx" });
    assert.deepEqual(config.owners, ["1", "2"]);
    assert.deepEqual(config.prefixes, ["!", "."]);
    assert.equal(config.prefixless, true);
    assert.equal(config.defaultLang, "id");
  });

  test("format picks language and fills placeholders", () => {
    assert.equal(format({ en: "Hi {name}", id: "Halo {name}" }, "id", { name: "A" }), "Halo A");
    assert.equal(format("Keep {unknown}", "en"), "Keep {unknown}");
  });

  test("JsonStore persists atomically and refuses corrupt files", () => {
    const file = path.join(tmp, "store", "users.json");
    const store = new JsonStore(file, () => ({ lang: "en", points: 0 }));
    store.update("a", { points: 5 });
    assert.deepEqual(new JsonStore(file, () => ({})).get("a"), { lang: "en", points: 5 });
    assert.deepEqual(fs.readdirSync(path.dirname(file)), ["users.json"]);

    fs.writeFileSync(file, "{not json");
    assert.throws(() => new JsonStore(file, () => ({})), /Corrupt JSON/);
    assert.equal(fs.readFileSync(file, "utf-8"), "{not json");
  });
});

describe("routing", () => {
  test("parseCommand handles prefixes, args and prefixless mode", async () => {
    const bot = await createBot();
    assert.deepEqual(bot.parseCommand("!Help  menu | x "), { alias: "help", args: ["menu", "x"], prefixed: true });
    assert.deepEqual(bot.parseCommand(". ping"), { alias: "ping", args: [], prefixed: true });
    assert.equal(bot.parseCommand("ping"), null);
    assert.equal(bot.parseCommand("!"), null);

    const loose = await createBot({ PREFIXLESS: "true" });
    assert.deepEqual(loose.parseCommand("ping"), { alias: "ping", args: [], prefixed: false });
  });

  test("registry discovers grouped commands", async () => {
    const bot = await createBot();
    assert.equal(bot.registry.commands.length, 7);
    assert.equal(bot.registry.find("S").constructor.name, "Sticker");
    assert.deepEqual(bot.registry.find("tagall").group, { emoji: "👥", name: "Group" });
  });

  test("runs a prefixed command and ignores own and revoked messages", async () => {
    const bot = await createBot();
    const ping = message("!ping");
    await bot.handle(ping);
    assert.match(ping.replies[0], /^🏓 Pong!/);

    const own = message("!ping", { fromMe: true });
    await bot.handle(own);
    const revoked = message("!ping", { extra: { message: { protocolMessage: { type: 0 } } } });
    await bot.handle(revoked);
    assert.deepEqual([own.replies, revoked.replies], [[], []]);
  });

  test("interceptors see non-command messages before prefixless commands", async () => {
    const bot = await createBot({ PREFIXLESS: "true" });
    const seen = [];
    bot.use((msg) => {
      seen.push(msg.text);
      return msg.text === "ping";
    });

    const consumed = message("ping");
    await bot.handle(consumed);
    assert.deepEqual(consumed.replies, []);

    const prefixed = message("!ping");
    await bot.handle(prefixed);
    assert.equal(prefixed.replies.length, 1);
    assert.deepEqual(seen, ["ping"]);
  });

  test("cooldown blocks repeated use", async () => {
    const bot = await createBot();
    await bot.handle(message("!ping"));
    const again = message("!ping");
    await bot.handle(again);
    assert.match(again.replies[0], /Please wait \ds/);
  });

  test("errors are caught and reported", async () => {
    const bot = await createBot();
    class Boom extends Command {
      aliases = ["boom"];
      description = "fails";
      async execute() {
        throw new Error("boom");
      }
    }
    bot.registry.register(new Boom());
    const msg = message("!boom");
    const errors = console.error;
    console.error = () => {};
    try {
      await bot.handle(msg);
    } finally {
      console.error = errors;
    }
    assert.deepEqual(msg.replies, ["Something went wrong, please try again later."]);
  });
});

describe("interactive params", () => {
  test("asks for a missing param and continues with the reply", async () => {
    const bot = await createBot();
    const start = message("!help");
    await bot.handle(start);
    assert.match(start.replies[0], /Which command\?/);

    const answer = message("menu");
    await bot.handle(answer);
    assert.match(answer.replies[0], /^\*menu\*\nShow all commands/);

    const after = message("menu");
    await bot.handle(after);
    assert.deepEqual(after.replies, []);
  });

  test("invalid values are re-asked, cancel ends the session", async () => {
    const bot = await createBot();
    const start = message("!lang klingon");
    await bot.handle(start);
    assert.deepEqual(start.replies.length, 2);
    assert.match(start.replies[0], /Invalid value for \*language\*/);

    const cancel = message("cancel");
    await bot.handle(cancel);
    assert.deepEqual(cancel.replies, ["Cancelled."]);
  });

  test("sessions are per chat, and a prefixed command replaces the session", async () => {
    const bot = await createBot();
    await bot.handle(message("!help"));

    const elsewhere = message("menu", { from: GROUP, group: true });
    await bot.handle(elsewhere);
    assert.deepEqual(elsewhere.replies, []);

    const ping = message("!ping");
    await bot.handle(ping);
    assert.match(ping.replies[0], /Pong/);
  });

  test("language choice is stored and used for replies", async () => {
    const bot = await createBot();
    const msg = message("!lang id");
    await bot.handle(msg);
    assert.deepEqual(msg.replies, ["Bahasa diganti ke Bahasa Indonesia."]);
    assert.equal(bot.users.get(USER_JID).lang, "id");

    const help = message("!help nope");
    await bot.handle(help);
    assert.deepEqual(help.replies, ["Perintah *nope* tidak ditemukan."]);
  });
});

describe("permissions and identity", () => {
  test("lid authors resolve to phone ids", async () => {
    const bot = await createBot();
    assert.equal(await bot.resolveUserId("999@lid"), OWNER_JID);
    assert.equal(await bot.resolveUserId("123@lid"), "123@lid");
    assert.equal(await bot.resolveUserId("6281111111111:7@s.whatsapp.net"), OWNER_JID);
    assert.equal(await bot.resolveUserId(GROUP), GROUP);
  });

  test("owner-only commands check the canonical id", async () => {
    const bot = await createBot();
    const denied = message("!stats");
    await bot.handle(denied);
    assert.deepEqual(denied.replies, ["This command is for the bot owner only."]);

    const owner = message("!stats", { author: "999@lid" });
    await bot.handle(owner);
    assert.match(owner.replies[0], /Uptime:/);
  });

  test("group admin check matches lid participants", async () => {
    const bot = await createBot();
    const dm = message("!tagall");
    await bot.handle(dm);
    assert.deepEqual(dm.replies, ["This command can only be used in groups."]);

    const member = message("!tagall", { group: true });
    await bot.handle(member);
    assert.deepEqual(member.replies, ["Only group admins can use this command."]);

    const admin = message("!tagall hello", { group: true, author: "999@lid" });
    await bot.handle(admin);
    assert.equal(bot.sent.length, 1);
    assert.match(bot.sent[0].text, /^hello\n@999\n@555$/);
    assert.deepEqual(bot.sent[0].mentions, ["999@lid", "555@lid"]);
  });
});

describe("review regressions", () => {
  test("cooldown is shared by all aliases of a command", async () => {
    const bot = await createBot();
    await bot.handle(message("!ping"));
    const alias = message("!p");
    await bot.handle(alias);
    assert.match(alias.replies[0], /Please wait/);
  });

  test("concurrent requests can't bypass the cooldown, failures release it", async () => {
    const bot = await createBot();
    let runs = 0;
    class Slow extends Command {
      aliases = ["slow"];
      description = "slow";
      cooldown = 30;
      async execute() {
        runs++;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return runs > 1 ? undefined : false;
      }
    }
    bot.registry.register(new Slow());
    await Promise.all([bot.handle(message("!slow")), bot.handle(message("!slow"))]);
    assert.equal(runs, 1);

    await bot.handle(message("!slow"));
    assert.equal(runs, 2);
    const blocked = message("!slow");
    await bot.handle(blocked);
    assert.equal(runs, 2);
    assert.match(blocked.replies[0], /Please wait/);
  });

  test("prefixless invocations stay silent when they can't run", async () => {
    const bot = await createBot({ PREFIXLESS: "true" });
    for (const text of ["stats please", "help", "tagall"]) {
      const msg = message(text, { group: text === "tagall" });
      await bot.handle(msg);
      assert.deepEqual(msg.replies, [], text);
    }
    assert.equal(bot.sessions.get(USER_JID, USER_JID), undefined);
  });

  test("messages without text don't feed a session and reach interceptors", async () => {
    const bot = await createBot();
    const seen = [];
    bot.use((msg) => void seen.push(msg.message));
    await bot.handle(message("!help"));

    const sticker = message("", { extra: { message: { stickerMessage: {} } } });
    await bot.handle(sticker);
    assert.deepEqual(sticker.replies, []);
    assert.equal(seen.length, 1);

    const answer = message("menu");
    await bot.handle(answer);
    assert.match(answer.replies[0], /^\*menu\*/);
  });

  test("invalid optional values are reported without opening a session", async () => {
    const bot = await createBot();
    class Roll extends Command {
      aliases = ["roll"];
      description = "roll";
      params = [{ name: "sides", prompt: "Sides?", required: false, parse: (raw) => (Number(raw) > 1 ? Number(raw) : undefined) }];
      async execute({ params, reply }) {
        await reply(`sides=${params.sides ?? 6}`);
      }
    }
    bot.registry.register(new Roll());
    const msg = message("!roll abc");
    await bot.handle(msg);
    assert.deepEqual(msg.replies, ["Invalid value for *sides*.", "sides=6"]);
    assert.equal(bot.sessions.get(USER_JID, USER_JID), undefined);
  });

  test("a denied prefixed command still ends the pending session", async () => {
    const bot = await createBot();
    await bot.handle(message("!help"));
    await bot.handle(message("!stats"));
    const chat = message("hello there");
    await bot.handle(chat);
    assert.deepEqual(chat.replies, []);
  });

  test("the last param takes the rest of the input", async () => {
    const bot = await createBot();
    await bot.handle(message("!tagall meeting at 5 | bring laptops", { group: true, author: "999@lid" }));
    assert.match(bot.sent[0].text, /^meeting at 5 \| bring laptops\n/);
  });

  test("help hides owner-only commands from other users", async () => {
    const bot = await createBot();
    const msg = message("!help stats");
    await bot.handle(msg);
    assert.deepEqual(msg.replies, ["Command *stats* not found."]);
  });

  test("multi-character prefixes and the example .env prefixes work", async () => {
    const dotenv = (await import("dotenv")).default;
    const env = dotenv.parse(fs.readFileSync(path.resolve(".env.example")));
    assert.deepEqual(loadConfig(env).prefixes, ["!", ".", "-", "/", "#"]);

    const bot = await createBot({ PREFIXES: "🤖" });
    assert.deepEqual(bot.parseCommand("🤖ping"), { alias: "ping", args: [], prefixed: true });
  });
});
