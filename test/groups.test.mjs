import { test, describe, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AutoWA, setCredentialsDir } from "../dist/index.js";

const ORIGINAL_CWD = process.cwd();
let tmpDir;
let counter = 0;
const created = [];
const tick = () => new Promise((r) => setImmediate(r));
const settle = async () => {
  for (let i = 0; i < 6; i++) await tick();
};

const BOT = "6280000000000:1@s.whatsapp.net";
const BOT_LID = "100000000000001:1@lid";
const GROUP = "120363000000000001@g.us";
const GROUP_2 = "120363000000000002@g.us";
const ALICE = "6281111111111@s.whatsapp.net"; // admin, addressed by phone number
const BOB = "6282222222222@s.whatsapp.net";
const CAROL_LID = "200000000000001@lid"; // admin known only by its @lid
const DAVE_LID = "200000000000002@lid"; // member with a phoneNumber attached

const participants = () => [
  { id: ALICE, admin: "superadmin" },
  { id: BOB, admin: null },
  { id: CAROL_LID, admin: "admin" },
  { id: DAVE_LID, phoneNumber: "6283333333333@s.whatsapp.net", admin: null },
  { id: BOT, lid: BOT_LID, admin: null },
];

function makeSock(overrides = {}) {
  const calls = { groupMetadata: [], fetchAll: 0, pnLookups: [] };
  const state = {
    groups: {
      [GROUP]: { id: GROUP, subject: "Test Group", participants: participants() },
      [GROUP_2]: { id: GROUP_2, subject: "Other", participants: [{ id: ALICE, admin: "admin" }] },
    },
  };
  const sock = {
    calls,
    state,
    ev: new EventEmitter(),
    authState: { creds: { registered: true } },
    user: { id: BOT, lid: BOT_LID },
    end() {},
    logout: async () => {},
    onWhatsApp: async (jid) => [{ exists: true, jid }],
    groupMetadata: async (jid) => {
      calls.groupMetadata.push(jid);
      if (!state.groups[jid]) throw new Error("item-not-found");
      return structuredClone(state.groups[jid]);
    },
    groupFetchAllParticipating: async () => {
      calls.fetchAll++;
      return structuredClone(state.groups);
    },
    signalRepository: {
      lidMapping: {
        getPNForLID: async (lid) => {
          calls.pnLookups.push(lid);
          return lid === CAROL_LID ? "6284444444444@s.whatsapp.net" : null;
        },
      },
    },
    sendMessage: async () => ({ key: { id: "x" } }),
    sendPresenceUpdate: async () => {},
    readMessages: async () => {},
    ...overrides,
  };
  return sock;
}

/** A client whose socket is fake; group listeners are attached like a real login would. */
async function makeClient(sockOverrides = {}) {
  const client = new AutoWA(`groups-test-${process.pid}-${++counter}`, { logging: false });
  created.push(client);
  client.sock = makeSock(sockOverrides);
  await client.setupWASocket(async () => {});
  return client;
}

const events = (client, names) => {
  const seen = [];
  for (const name of names) client.on(name, (payload) => seen.push([name, payload]));
  return seen;
};

before(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "autowa-groups-"));
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

describe("instance-level group access", () => {
  test("getGroups lists every group and is cached", async () => {
    const client = await makeClient();
    const first = await client.getGroups();
    assert.deepEqual(first.map((g) => g.subject).sort(), ["Other", "Test Group"]);
    await client.getGroups();
    assert.equal(client.sock.calls.fetchAll, 1, "second call is served from the cache");

    await client.getGroups({ refresh: true });
    assert.equal(client.sock.calls.fetchAll, 2);
  });

  test("getGroupInfo reuses the cache; refresh asks again", async () => {
    const client = await makeClient();
    const info = await client.getGroupInfo(GROUP);
    assert.equal(info.subject, "Test Group");
    await client.getGroupInfo(GROUP);
    await client.getGroupInfo(GROUP);
    assert.equal(client.sock.calls.groupMetadata.length, 1);

    await client.getGroupInfo(GROUP, { refresh: true });
    assert.equal(client.sock.calls.groupMetadata.length, 2);
  });

  test("getGroupInfo still throws for a group that doesn't exist", async () => {
    const client = await makeClient();
    await assert.rejects(client.getGroupInfo("120363999999999999@g.us"), /not registered|Failed get exist/);
  });

  test("a list result also answers later single lookups without asking again", async () => {
    const client = await makeClient();
    await client.getGroups();
    await client.getGroupInfo(GROUP);
    assert.equal(client.sock.calls.groupMetadata.length, 0);
  });

  test("participants are normalized (phone jid, lid, admin flags)", async () => {
    const client = await makeClient();
    const members = await client.getGroupParticipants(GROUP);
    const byId = Object.fromEntries(members.map((m) => [m.id, m]));

    assert.deepEqual(byId[ALICE], {
      id: ALICE,
      jid: ALICE,
      lid: undefined,
      phoneNumber: ALICE,
      isAdmin: true,
      isSuperAdmin: true,
    });
    assert.equal(byId[BOB].isAdmin, false);
    assert.equal(byId[CAROL_LID].jid, "6284444444444@s.whatsapp.net", "resolved through the LID mapping");
    assert.equal(byId[CAROL_LID].lid, CAROL_LID);
    assert.equal(byId[DAVE_LID].jid, "6283333333333@s.whatsapp.net", "taken from phoneNumber, no lookup");
    assert.ok(!client.sock.calls.pnLookups.includes(DAVE_LID));

    const admins = await client.getGroupAdmins(GROUP);
    assert.deepEqual(admins.map((a) => a.id).sort(), [ALICE, CAROL_LID].sort());
  });

  test("isGroupAdmin matches phone numbers and lids, with or without a device suffix", async () => {
    const client = await makeClient();
    assert.equal(await client.isGroupAdmin(GROUP, ALICE), true);
    assert.equal(await client.isGroupAdmin(GROUP, "6281111111111:7@s.whatsapp.net"), true);
    assert.equal(await client.isGroupAdmin(GROUP, BOB), false);
    // admin only known by @lid, asked by phone number and by lid
    assert.equal(await client.isGroupAdmin(GROUP, "6284444444444@s.whatsapp.net"), true);
    assert.equal(await client.isGroupAdmin(GROUP, CAROL_LID), true);
    // a non-admin member known by lid + phoneNumber
    assert.equal(await client.isGroupAdmin(GROUP, "6283333333333@s.whatsapp.net"), false);
    assert.equal(await client.isGroupAdmin(GROUP, "999@lid"), false);
  });

  test("isBotGroupAdmin checks the bot's phone jid and lid", async () => {
    const client = await makeClient();
    assert.equal(await client.isBotGroupAdmin(GROUP), false);

    client.sock.state.groups[GROUP].participants.find((p) => p.id === BOT).admin = "admin";
    assert.equal(await client.isBotGroupAdmin(GROUP, { refresh: true }), true);

    assert.deepEqual(client.getBotJids(), { jid: "6280000000000@s.whatsapp.net", lid: "100000000000001@lid" });
  });

  test("resolveJid maps lids, caches lookups and leaves unknown ids alone", async () => {
    const client = await makeClient();
    assert.equal(await client.resolveJid(CAROL_LID), "6284444444444@s.whatsapp.net");
    await client.resolveJid(CAROL_LID);
    assert.equal(client.sock.calls.pnLookups.filter((l) => l === CAROL_LID).length, 1);
    assert.equal(await client.resolveJid("999@lid"), "999@lid");
    assert.equal(await client.resolveJid("6281111111111:3@s.whatsapp.net"), ALICE);
    assert.equal(await client.resolveJid(null), "");
  });

  test("group lookups fail clearly when the socket is not there yet", async () => {
    const client = new AutoWA(`groups-test-${process.pid}-${++counter}`, { logging: false });
    created.push(client);
    await assert.rejects(client.getGroups(), /Not connected yet/);
  });
});

describe("cache invalidation", () => {
  test("a participants update drops that group only, before listeners run", async () => {
    const client = await makeClient();
    await client.getGroups();
    const before = client.sock.calls.fetchAll;

    client.sock.state.groups[GROUP].participants.push({ id: "6285555555555@s.whatsapp.net", admin: null });
    client.sock.ev.emit("group-participants.update", {
      id: GROUP,
      author: ALICE,
      participants: [{ id: "6285555555555@s.whatsapp.net" }],
      action: "add",
    });
    const info = await client.getGroupInfo(GROUP);
    assert.equal(info.participants.length, 6, "fresh data right after the event");
    assert.equal(client.sock.calls.fetchAll, before);
    await client.getGroups();
    assert.equal(client.sock.calls.fetchAll, before + 1, "the cached list was dropped too");
  });

  test("groups.update drops the cache; reconnecting drops everything", async () => {
    const client = await makeClient();
    await client.getGroupInfo(GROUP);
    client.sock.state.groups[GROUP].subject = "Renamed";
    client.sock.ev.emit("groups.update", [{ id: GROUP, subject: "Renamed" }]);
    assert.equal((await client.getGroupInfo(GROUP)).subject, "Renamed");

    client.sock.state.groups[GROUP].subject = "After reconnect";
    client.sock.ev.emit("connection.update", { connection: "open" });
    assert.equal((await client.getGroupInfo(GROUP)).subject, "After reconnect");
  });

  test("a change that happens while fetching is not cached as fresh", async () => {
    let release;
    const gate = new Promise((r) => (release = r));
    let calls = 0;
    const client = await makeClient({
      groupMetadata: async (jid) => {
        calls++;
        if (calls === 1) {
          await gate;
          return { id: jid, subject: "stale", participants: [] };
        }
        return { id: jid, subject: "fresh", participants: [] };
      },
    });
    const slow = client.groups.get(GROUP);
    await tick();
    client.groups.invalidate(GROUP);
    release();
    assert.equal((await slow).subject, "stale");
    assert.equal((await client.groups.get(GROUP)).subject, "fresh", "the stale answer was not cached");
  });
});

describe("group events", () => {
  const ALL = [
    "group-joined",
    "group-left",
    "group-member-added",
    "group-member-removed",
    "group-member-promoted",
    "group-member-demoted",
    "group-member-update",
  ];

  test("members added: one event with normalized participants, author and fresh group", async () => {
    const client = await makeClient();
    const seen = events(client, ALL);
    client.sock.state.groups[GROUP].participants.push({ id: "6285555555555@s.whatsapp.net", admin: null });

    client.sock.ev.emit("group-participants.update", {
      id: GROUP,
      author: CAROL_LID,
      authorPn: "6284444444444@s.whatsapp.net",
      participants: [
        { id: "6285555555555@s.whatsapp.net" },
        { id: DAVE_LID, phoneNumber: "6283333333333@s.whatsapp.net" },
      ],
      action: "add",
    });
    await settle();

    assert.deepEqual(seen.map(([name]) => name), ["group-member-update", "group-member-added"]);
    const event = seen[1][1];
    assert.equal(event.groupId, GROUP);
    assert.equal(event.action, "add");
    assert.equal(event.reason, undefined);
    assert.deepEqual(event.participants.map((p) => p.jid), [
      "6285555555555@s.whatsapp.net",
      "6283333333333@s.whatsapp.net",
    ]);
    assert.deepEqual(event.author, { id: CAROL_LID, jid: "6284444444444@s.whatsapp.net" });
    assert.equal(event.group.subject, "Test Group");
    assert.equal(event.group.participants.length, 6);
    assert.equal(typeof event.replyWithText, "function");
  });

  test("a member removing themselves is 'left'; an admin removing someone is 'removed'", async () => {
    const client = await makeClient();
    const seen = events(client, ["group-member-removed"]);

    client.sock.ev.emit("group-participants.update", {
      id: GROUP,
      author: BOB,
      participants: [{ id: BOB }],
      action: "remove",
    });
    client.sock.ev.emit("group-participants.update", {
      id: GROUP,
      author: ALICE,
      participants: [{ id: BOB }],
      action: "remove",
    });
    client.sock.ev.emit("group-participants.update", {
      id: GROUP,
      author: ALICE,
      participants: [{ id: BOB }, { id: DAVE_LID }],
      action: "remove",
    });
    await settle();

    assert.deepEqual(seen.map(([, e]) => e.reason), ["left", "removed", "removed"]);
  });

  test("a lid member leaving is recognised through authorPn", async () => {
    const client = await makeClient();
    const seen = events(client, ["group-member-removed"]);
    client.sock.ev.emit("group-participants.update", {
      id: GROUP,
      author: "300000000000001@lid",
      authorPn: "6283333333333@s.whatsapp.net",
      participants: [{ id: DAVE_LID, phoneNumber: "6283333333333@s.whatsapp.net" }],
      action: "remove",
    });
    await settle();
    assert.equal(seen[0][1].reason, "left");
  });

  test("promote and demote carry the resulting role", async () => {
    const client = await makeClient();
    const seen = events(client, ["group-member-promoted", "group-member-demoted"]);

    client.sock.ev.emit("group-participants.update", {
      id: GROUP,
      author: ALICE,
      participants: [{ id: BOB, admin: null }],
      action: "promote",
    });
    client.sock.ev.emit("group-participants.update", {
      id: GROUP,
      author: ALICE,
      participants: [{ id: CAROL_LID, admin: "admin" }],
      action: "demote",
    });
    await settle();

    assert.deepEqual(seen.map(([name]) => name), ["group-member-promoted", "group-member-demoted"]);
    assert.equal(seen[0][1].participants[0].isAdmin, true);
    assert.equal(seen[1][1].participants[0].isAdmin, false);
    assert.equal(seen[0][1].author.jid, ALICE);
  });

  test("the bot being added is 'group-joined', not a member event", async () => {
    const client = await makeClient();
    const seen = events(client, ["group-joined", "group-member-added"]);

    client.sock.ev.emit("group-participants.update", {
      id: GROUP,
      author: ALICE,
      participants: [{ id: BOT_LID, phoneNumber: "6280000000000@s.whatsapp.net" }],
      action: "add",
    });
    await settle();

    assert.deepEqual(seen.map(([name]) => name), ["group-joined"]);
    const event = seen[0][1];
    assert.equal(event.groupId, GROUP);
    assert.equal(event.reason, "added");
    assert.equal(event.addedBy.jid, ALICE);
    assert.equal(event.group.subject, "Test Group");
    assert.equal(typeof event.replyWithText, "function");
  });

  test("bot added together with others: join event plus a member event without the bot", async () => {
    const client = await makeClient();
    const seen = events(client, ["group-joined", "group-member-added"]);
    client.sock.ev.emit("group-participants.update", {
      id: GROUP,
      author: ALICE,
      participants: [{ id: BOT }, { id: BOB }],
      action: "add",
    });
    await settle();

    assert.deepEqual(seen.map(([name]) => name), ["group-joined", "group-member-added"]);
    assert.deepEqual(seen[1][1].participants.map((p) => p.id), [BOB]);
  });

  test("a new group created with the bot is announced once, even if an add follows", async () => {
    const client = await makeClient();
    const seen = events(client, ["group-joined"]);

    client.sock.ev.emit("groups.upsert", [
      { id: GROUP_2, subject: "New", participants: [], author: ALICE, authorPn: ALICE },
    ]);
    client.sock.ev.emit("group-participants.update", {
      id: GROUP_2,
      author: ALICE,
      participants: [{ id: BOT }],
      action: "add",
    });
    await settle();

    assert.equal(seen.length, 1);
    assert.equal(seen[0][1].reason, "created");
    assert.equal(seen[0][1].group.subject, "New");
    assert.equal(seen[0][1].addedBy.jid, ALICE);
  });

  test("the bot being removed is 'group-left' with who did it; leaving yourself has no remover", async () => {
    const client = await makeClient();
    await client.getGroupInfo(GROUP);
    const seen = events(client, ["group-left", "group-member-removed"]);

    client.sock.ev.emit("group-participants.update", {
      id: GROUP,
      author: ALICE,
      participants: [{ id: BOT }],
      action: "remove",
    });
    client.sock.ev.emit("group-participants.update", {
      id: GROUP_2,
      author: BOT,
      participants: [{ id: BOT }],
      action: "remove",
    });
    await settle();

    assert.deepEqual(seen.map(([name]) => name), ["group-left", "group-left"]);
    assert.equal(seen[0][1].reason, "removed");
    assert.equal(seen[0][1].removedBy.jid, ALICE);
    assert.equal(seen[0][1].group.subject, "Test Group", "last known info from the cache");
    assert.equal(seen[1][1].reason, "left");
    assert.equal(seen[1][1].removedBy, null);
  });

  test("a member changing number (modify) only produces the legacy event", async () => {
    const client = await makeClient();
    const seen = events(client, ALL);
    client.sock.ev.emit("group-participants.update", {
      id: GROUP,
      author: ALICE,
      participants: [{ id: BOB }],
      action: "modify",
    });
    await settle();
    assert.deepEqual(seen.map(([name]) => name), ["group-member-update"]);
  });

  test("the legacy group-member-update event keeps its shape and reply helpers", async () => {
    const client = await makeClient();
    const seen = events(client, ["group-member-update"]);
    client.sock.ev.emit("group-participants.update", {
      id: GROUP,
      author: ALICE,
      participants: [{ id: BOB }],
      action: "add",
    });
    await settle();

    const [, legacy] = seen[0];
    assert.equal(legacy.id, GROUP);
    assert.equal(legacy.action, "add");
    assert.equal(legacy.sessionId, client.sessionId);
    for (const helper of [
      "replyWithText",
      "replyWithAudio",
      "replyWithImage",
      "replyWithVideo",
      "replyWithSticker",
      "replyWithTyping",
      "replyWithRecording",
    ]) {
      assert.equal(typeof legacy[helper], "function", helper);
    }
  });

  test("events are delivered in the order they arrived, even when an earlier one is slower", async () => {
    let calls = 0;
    const client = await makeClient({
      groupMetadata: async (jid) => {
        // the first lookup is slow, the others are instant
        if (++calls === 1) await new Promise((r) => setTimeout(r, 40));
        return { id: jid, subject: `lookup ${calls}`, participants: [] };
      },
    });
    const seen = events(client, ["group-member-added", "group-member-promoted", "group-member-removed"]);
    const emit = (action, author) =>
      client.sock.ev.emit("group-participants.update", {
        id: GROUP,
        author,
        participants: [{ id: BOB }],
        action,
      });
    emit("add", ALICE);
    emit("promote", ALICE);
    emit("remove", BOB);
    await new Promise((r) => setTimeout(r, 120));

    assert.deepEqual(seen.map(([name]) => name), [
      "group-member-added",
      "group-member-promoted",
      "group-member-removed",
    ]);
  });

  test("an event is delivered without group info when the lookup hangs", async () => {
    const client = await makeClient({ groupMetadata: () => new Promise(() => {}) });
    client.groups.eventFetchTimeoutMs = 30;
    const seen = events(client, ["group-member-added", "group-member-promoted"]);
    for (const action of ["add", "promote"]) {
      client.sock.ev.emit("group-participants.update", {
        id: GROUP,
        author: ALICE,
        participants: [{ id: BOB }],
        action,
      });
    }
    await new Promise((r) => setTimeout(r, 150));
    assert.deepEqual(seen.map(([name, e]) => [name, e.group]), [
      ["group-member-added", null],
      ["group-member-promoted", null],
    ]);
  });

  test("a failing metadata fetch still delivers the event with group: null", async () => {
    const client = await makeClient({
      groupMetadata: async () => {
        throw new Error("rate-overlimit");
      },
    });
    const seen = events(client, ["group-member-added"]);
    client.sock.ev.emit("group-participants.update", {
      id: GROUP,
      author: ALICE,
      participants: [{ id: BOB }],
      action: "add",
    });
    await settle();
    assert.equal(seen.length, 1);
    assert.equal(seen[0][1].group, null);
  });

  test("group listeners are removed when the socket is cleaned up", async () => {
    const client = await makeClient();
    const ev = client.sock.ev;
    assert.ok(ev.listenerCount("groups.upsert") >= 1);
    client.cleanupSocket();
    for (const name of ["groups.upsert", "groups.update", "group-participants.update"]) {
      assert.equal(ev.listenerCount(name), 0, name);
    }
  });
});
