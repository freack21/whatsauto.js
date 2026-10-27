import { test, describe, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  AutoWA,
  AutoWAError,
  sessionsList,
  deleteSession,
  setCredentialsDir,
} from "../dist/index.js";

const ORIGINAL_CWD = process.cwd();
let tmpDir;
let idCounter = 0;
const created = [];

const tick = () => new Promise((r) => setImmediate(r));

function makeFakeSock(overrides = {}) {
  const calls = {
    end: [],
    logout: 0,
    onWhatsApp: [],
    groupMetadata: [],
    sendMessage: [],
    presence: [],
    requestPairingCode: [],
  };
  const sock = {
    calls,
    ev: new EventEmitter(),
    authState: { creds: { registered: true } },
    user: { id: "6281111111111:1@s.whatsapp.net" },
    end(err) {
      calls.end.push(err);
    },
    logout: async () => {
      calls.logout++;
    },
    onWhatsApp: async (jid) => {
      calls.onWhatsApp.push(jid);
      return [{ exists: true, jid }];
    },
    groupMetadata: async (jid) => {
      calls.groupMetadata.push(jid);
      return { id: jid };
    },
    sendMessage: async (...a) => {
      calls.sendMessage.push(a);
      return { key: { id: "x" } };
    },
    sendPresenceUpdate: async (...a) => {
      calls.presence.push(a);
    },
    readMessages: async () => {},
    ...overrides,
  };
  return sock;
}

function makeClient(sockOverrides, options = {}) {
  const id = `test-session-${process.pid}-${++idCounter}`;
  const client = new AutoWA(id, { logging: false, ...options });
  created.push(client);
  if (sockOverrides !== null) client.sock = makeFakeSock(sockOverrides);
  return client;
}

function credsDir(id) {
  return resolve("wa_creds", id + "_creds");
}

function makeCredsDir(id) {
  const dir = credsDir(id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "creds.json"), "{}");
  return dir;
}

before(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "autowa-test-"));
  process.chdir(tmpDir);
  setCredentialsDir("wa_creds");
});

after(() => {
  process.chdir(ORIGINAL_CWD);
  rmSync(tmpDir, { recursive: true, force: true });
});

afterEach(async () => {
  while (created.length) {
    const c = created.pop();
    c.connected = false;
    try {
      await c.destroy();
    } catch {}
  }
});

describe("session registry", () => {
  test("constructor registers, destroy() unregisters", async () => {
    const client = makeClient({});
    assert.ok(sessionsList().includes(client.sessionId));
    await client.destroy();
    assert.ok(!sessionsList().includes(client.sessionId));
  });

  test("deleteSession on never-connected client returns true, no logout", async () => {
    const client = makeClient({});
    assert.equal(await deleteSession(client.sessionId), true);
    assert.ok(!sessionsList().includes(client.sessionId));
    assert.equal(client.sock.calls.logout, 0);
  });

  test("deleteSession works even without any socket assigned", async () => {
    const client = makeClient(null);
    assert.equal(await deleteSession(client.sessionId), true);
    assert.ok(!sessionsList().includes(client.sessionId));
  });

  test("deleteSession of unknown id returns false", async () => {
    assert.equal(await deleteSession("no-such-session-xyz"), false);
  });

  test("destroy() calls logout when connected", async () => {
    const client = makeClient({});
    client.connected = true;
    await client.destroy();
    assert.equal(client.sock.calls.logout, 1);
    assert.equal(client.connected, false);
    assert.ok(!sessionsList().includes(client.sessionId));
  });

  test("destroy() rejects with AutoWAError when logout fails, still unregisters", async () => {
    const client = makeClient({
      logout: async () => {
        throw new Error("boom");
      },
    });
    client.connected = true;
    await assert.rejects(client.destroy(), AutoWAError);
    assert.ok(!sessionsList().includes(client.sessionId));
  });
});

describe("destroy credentials", () => {
  test("destroy(true) removes creds dir", async () => {
    const client = makeClient({});
    const dir = makeCredsDir(client.sessionId);
    assert.ok(dir.startsWith(tmpDir));
    await client.destroy(true);
    assert.equal(existsSync(dir), false);
  });

  test("destroy() keeps creds dir", async () => {
    const client = makeClient({});
    const dir = makeCredsDir(client.sessionId);
    await client.destroy();
    assert.equal(existsSync(dir), true);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("receiver cache", () => {
  test("two sends to same number -> onWhatsApp once", async () => {
    const client = makeClient({});
    await client.sendText({ to: "6282222222222", text: "a" });
    await client.sendText({ to: "6282222222222", text: "b" });
    assert.deepEqual(client.sock.calls.onWhatsApp, ["6282222222222@s.whatsapp.net"]);
    assert.equal(client.sock.calls.sendMessage.length, 2);
    assert.equal(client.sock.calls.sendMessage[0][0], "6282222222222@s.whatsapp.net");
  });

  test("unregistered number rejects and is not cached", async () => {
    const calls = [];
    const client = makeClient({
      onWhatsApp: async (jid) => {
        calls.push(jid);
        return [{ exists: false, jid }];
      },
    });
    await assert.rejects(client.sendText({ to: "6283333333333", text: "a" }), AutoWAError);
    assert.equal(client.receiverCache.has("6283333333333@s.whatsapp.net"), false);
    await assert.rejects(client.sendText({ to: "6283333333333", text: "a" }), AutoWAError);
    assert.equal(calls.length, 2);
    assert.equal(client.sock.calls.sendMessage.length, 0);
  });

  for (const target of [
    "123456789@lid",
    "status@broadcast",
    "123@newsletter",
    "123@hosted",
  ]) {
    test(`${target} skips onWhatsApp`, async () => {
      const client = makeClient({});
      await client.sendText({ to: target, text: "hi" });
      assert.equal(client.sock.calls.onWhatsApp.length, 0);
      assert.equal(client.sock.calls.groupMetadata.length, 0);
      assert.equal(client.sock.calls.sendMessage[0][0], target);
    });
  }

  test("cache is capped at 1000 and evicts the oldest key", async () => {
    const client = makeClient({});
    const now = Date.now();
    for (let i = 0; i < 1000; i++) {
      client.receiverCache.set(`62800000${String(i).padStart(5, "0")}@s.whatsapp.net`, now);
    }
    const oldest = client.receiverCache.keys().next().value;
    await client.sendText({ to: "6289999999999", text: "x" });
    assert.ok(client.receiverCache.size <= 1000);
    assert.equal(client.receiverCache.has(oldest), false);
    assert.equal(client.receiverCache.has("6289999999999@s.whatsapp.net"), true);
  });
});

describe("sendTyping", () => {
  test("callback error surfaces, presence composing -> paused", async () => {
    const client = makeClient({});
    const err = new Error("cb failed");
    await assert.rejects(
      client.sendTyping({
        to: "6282222222222",
        callback: async () => {
          throw err;
        },
      }),
      (e) => e === err
    );
    assert.deepEqual(
      client.sock.calls.presence.map((p) => p[0]),
      ["composing", "paused"]
    );
  });

  test("failing paused update does not mask callback error", async () => {
    const presence = [];
    const client = makeClient({
      sendPresenceUpdate: async (type) => {
        presence.push(type);
        if (type === "paused") throw new Error("presence failed");
      },
    });
    const err = new Error("cb failed");
    await assert.rejects(
      client.sendTyping({
        to: "6282222222222",
        callback: () => {
          throw err;
        },
      }),
      (e) => e === err
    );
    assert.deepEqual(presence, ["composing", "paused"]);
  });
});

describe("forwardMessage", () => {
  test("sendMessage failure -> AutoWAError", async () => {
    const client = makeClient({
      sendMessage: async () => {
        throw new Error("nope");
      },
    });
    await assert.rejects(
      client.forwardMessage({ to: "6282222222222", msg: { key: { id: "1" }, message: {} } }),
      (e) => e instanceof AutoWAError && /Failed forward a message: nope/.test(e.message)
    );
  });
});

describe("downloadMedia path validation", () => {
  const fakeMsg = { key: { id: "1" }, message: { imageMessage: {} } };

  test("path escaping cwd rejects with AutoWAError", async () => {
    const client = makeClient({});
    await assert.rejects(
      client.downloadMedia(fakeMsg, { path: "../../escape" }, "jpg"),
      (e) => e instanceof AutoWAError && /outside the working directory/.test(e.message)
    );
  });

  test("absolute path is kept inside cwd (no path error)", async () => {
    const client = makeClient({});
    let error;
    try {
      await client.downloadMedia(fakeMsg, { path: "/abs/x" }, "jpg");
    } catch (e) {
      error = e;
    }
    if (error) assert.doesNotMatch(String(error.message), /outside the working directory/);
  });
});

describe("connection handling", () => {
  async function setup(sockOverrides = {}, options = {}) {
    const client = makeClient(sockOverrides, options);
    const sock = client.sock;
    await client.setupWASocket(async () => {});
    const events = [];
    for (const ev of ["connected", "disconnected", "qr", "pairing-code", "connecting"]) {
      client.on(ev, (...args) => events.push([ev, ...args]));
    }
    return { client, sock, events };
  }

  const closeWith = (statusCode) => ({
    connection: "close",
    lastDisconnect: { error: { output: { statusCode } } },
  });

  test("open -> connected", async () => {
    const { client, sock, events } = await setup();
    sock.ev.emit("connection.update", { connection: "open" });
    await tick();
    assert.deepEqual(events, [["connected"]]);
    assert.equal(client.connected, true);
  });

  test("401 loggedOut -> disconnected, unregistered, creds removed, no logout", async () => {
    const { client, sock, events } = await setup();
    const dir = makeCredsDir(client.sessionId);
    sock.ev.emit("connection.update", { connection: "open" });
    sock.ev.emit("connection.update", closeWith(401));
    await tick();
    await tick();
    assert.deepEqual(events, [["connected"], ["disconnected"]]);
    assert.ok(!sessionsList().includes(client.sessionId));
    assert.equal(existsSync(dir), false);
    assert.equal(sock.calls.logout, 0);
  });

  test("428 after destroyed -> no restart", async () => {
    const { client, sock, events } = await setup();
    let restarted = 0;
    client.startSocket = async () => {
      restarted++;
    };
    client.destroyed = true;
    sock.ev.emit("connection.update", closeWith(428));
    await tick();
    assert.equal(restarted, 0);
    assert.equal(client.retryCount, 0);
    assert.deepEqual(events, []);
  });

  test("close from stale socket is ignored", async () => {
    const { client, sock, events } = await setup();
    let restarted = 0;
    client.startSocket = async () => {
      restarted++;
    };
    client.sock = makeFakeSock();
    sock.ev.emit("connection.update", closeWith(401));
    await tick();
    assert.deepEqual(events, []);
    assert.ok(sessionsList().includes(client.sessionId));
    assert.equal(restarted, 0);
    assert.equal(client.retryCount, 0);
  });

  test("440 connectionReplaced -> disconnected, creds kept, sock.end called", async () => {
    const { client, sock, events } = await setup();
    const dir = makeCredsDir(client.sessionId);
    sock.ev.emit("connection.update", closeWith(440));
    await tick();
    assert.deepEqual(events, [["disconnected"]]);
    assert.equal(existsSync(dir), true);
    assert.ok(sock.calls.end.length >= 1);
    assert.equal(sock.calls.logout, 0);
    rmSync(dir, { recursive: true, force: true });
  });

  test("428 not destroyed -> retries and restarts after the delay", async () => {
    const { client, sock, events } = await setup();
    let restarted = 0;
    client.startSocket = async () => {
      restarted++;
    };
    client.retryDelayMs = 10;
    sock.ev.emit("connection.update", closeWith(428));
    assert.equal(client.retryCount, 1);
    assert.equal(restarted, 0);
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(restarted, 1);
    assert.deepEqual(events, []);
  });

  test("pairing code requested once, no qr event", async () => {
    const { client, sock, events } = await setup(
      {
        authState: { creds: { registered: false } },
        requestPairingCode: async (phone) => {
          sock.calls.requestPairingCode.push(phone);
          return "ABCD1234";
        },
      },
      { phoneNumber: "6281234567890@s.whatsapp.net", printQR: false }
    );
    sock.ev.emit("connection.update", { qr: "x" });
    sock.ev.emit("connection.update", { qr: "x" });
    await tick();
    await tick();
    assert.deepEqual(events, [["pairing-code", "ABCD1234"]]);
    assert.deepEqual(sock.calls.requestPairingCode, ["6281234567890"]);
    assert.equal(client.pairingCode, "ABCD1234");
  });

  test("pairing code failure ends socket with error, no pairing-code event", async () => {
    const err = new Error("pair failed");
    const { client, sock, events } = await setup(
      {
        authState: { creds: { registered: false } },
        requestPairingCode: async () => {
          throw err;
        },
      },
      { phoneNumber: "6281234567890@s.whatsapp.net", printQR: false }
    );
    sock.ev.emit("connection.update", { qr: "x" });
    await tick();
    await tick();
    assert.deepEqual(events, []);
    assert.deepEqual(sock.calls.end, [err]);
    assert.equal(client.pairingCode, undefined);
  });

  test("QR mode emits qr", async () => {
    const { sock, events } = await setup({}, { printQR: false });
    sock.ev.emit("connection.update", { qr: "abc" });
    await tick();
    assert.deepEqual(events, [["qr", "abc"]]);
  });
});

describe("message events", () => {
  test("messages.update -> message-updated with readable status", async () => {
    const client = makeClient({});
    await client.setupWASocket(async () => {});
    const got = [];
    client.on("message-updated", (d) => got.push(d));
    client.sock.ev.emit("messages.update", [
      { key: { id: "1" }, update: { status: 3 } },
      { key: { id: "2" }, update: {} },
    ]);
    await tick();
    assert.equal(got.length, 2);
    assert.equal(got[0].messageStatus, "delivered");
    assert.equal(got[0].key.id, "1");
    assert.equal(got[0].sessionId, client.sessionId);
    assert.equal(got[1].messageStatus, "unknown");
    assert.equal(got[1].key.id, "2");
  });

  test("messages.upsert notify -> message events", async () => {
    const client = makeClient({});
    await client.setupWASocket(async () => {});
    const got = [];
    client.on("message", (m) => got.push(m));
    const from = "6282222222222@s.whatsapp.net";
    client.sock.ev.emit("messages.upsert", {
      type: "notify",
      messages: [
        { key: { remoteJid: from, fromMe: false, id: "a" }, message: { conversation: "hello" } },
        { key: { remoteJid: from, fromMe: false, id: "b" }, message: { conversation: "world" } },
      ],
    });
    await tick();
    assert.equal(got.length, 2);
    assert.deepEqual(
      got.map((m) => m.text),
      ["hello", "world"]
    );
    for (const m of got) {
      assert.equal(m.from, from);
      assert.equal(m.author, from);
      assert.equal(m.receiver, "6281111111111@s.whatsapp.net");
      assert.equal(m.isGroup, false);
      assert.equal(m.hasMedia, false);
    }
  });

  test("messages.upsert append is ignored", async () => {
    const client = makeClient({});
    await client.setupWASocket(async () => {});
    let count = 0;
    client.on("message", () => count++);
    client.sock.ev.emit("messages.upsert", {
      type: "append",
      messages: [{ key: { remoteJid: "6282222222222@s.whatsapp.net", id: "a" }, message: { conversation: "x" } }],
    });
    await tick();
    assert.equal(count, 0);
  });
});

describe("AutoWAEvent", () => {
  test("removeAllListeners() without args clears all events", () => {
    const client = makeClient({});
    let count = 0;
    client.on("qr", () => count++);
    client.on("connected", () => count++);
    client.removeAllListeners();
    client.emit("qr", "x");
    client.emit("connected");
    assert.equal(count, 0);
  });

  test("removeAllListeners(event) only clears that event", () => {
    const client = makeClient({});
    let qr = 0;
    let conn = 0;
    client.on("qr", () => qr++);
    client.on("connected", () => conn++);
    client.removeAllListeners("qr");
    client.emit("qr", "x");
    client.emit("connected");
    assert.equal(qr, 0);
    assert.equal(conn, 1);
  });
});
