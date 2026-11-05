import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { BufferJSON } from "@whiskeysockets/baileys";
import { useAtomicAuthState } from "../dist/Utils/auth-state.js";
import { SentMessages } from "../dist/Utils/sent-messages.js";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "auth-"));

test("creds and keys round-trip, with Buffers intact, and no temp files are left", async () => {
  const dir = tmp();
  const { state, saveCreds } = await useAtomicAuthState(dir);
  await saveCreds();
  await state.keys.set({ session: { "123.0": Buffer.from("secret") }, "pre-key": { 1: Buffer.from("k") } });

  const again = await useAtomicAuthState(dir);
  assert.deepEqual(again.state.creds.noiseKey, state.creds.noiseKey, "same identity after reload");
  const { "123.0": value } = await again.state.keys.get("session", ["123.0"]);
  assert.equal(Buffer.from(value).toString(), "secret");
  assert.deepEqual(fs.readdirSync(dir).filter((f) => f.endsWith(".tmp")), []);
});

test("removing a key deletes its file; file names match Baileys' (/ and :)", async () => {
  const dir = tmp();
  const { state } = await useAtomicAuthState(dir);
  await state.keys.set({ session: { "a/b:c": Buffer.from("x") } });
  assert.ok(fs.existsSync(path.join(dir, "session-a__b-c.json")));
  await state.keys.set({ session: { "a/b:c": null } });
  assert.ok(!fs.existsSync(path.join(dir, "session-a__b-c.json")));
});

test("a session written by Baileys' own format is read", async () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, "sender-key-g.json"), JSON.stringify({ k: Buffer.from("v") }, BufferJSON.replacer));
  const { state } = await useAtomicAuthState(dir);
  const { g } = await state.keys.get("sender-key", ["g"]);
  assert.equal(Buffer.from(g.k).toString(), "v");
});

test("a corrupted key file is reported, not silently ignored", async () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, "session-x.json"), '{"truncated":');
  const warnings = [];
  const { state } = await useAtomicAuthState(dir, (m) => warnings.push(m));
  const got = await state.keys.get("session", ["x"]);
  assert.equal(got.x, null);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /session-x\.json is corrupted/);
});

test("a corrupted creds.json falls back to creds.json.bak instead of a new identity", async () => {
  const dir = tmp();
  const first = await useAtomicAuthState(dir);
  await first.saveCreds(); // creds.json
  await first.saveCreds(); // creds.json.bak = previous good copy
  assert.ok(fs.existsSync(path.join(dir, "creds.json.bak")));
  fs.writeFileSync(path.join(dir, "creds.json"), "garbage{");

  const warnings = [];
  const second = await useAtomicAuthState(dir, (m) => warnings.push(m));
  assert.deepEqual(second.state.creds.noiseKey, first.state.creds.noiseKey);
  assert.ok(warnings.some((m) => /restored from creds\.json\.bak/.test(m)));

  // saving with a bad current file never overwrites the good backup with garbage
  fs.writeFileSync(path.join(dir, "creds.json"), "garbage{");
  await second.saveCreds();
  const bak = JSON.parse(fs.readFileSync(path.join(dir, "creds.json.bak"), "utf-8"), BufferJSON.reviver);
  assert.deepEqual(bak.noiseKey, first.state.creds.noiseKey);
});

test("a write that dies half-way leaves the previous content (temp file never replaces it)", async () => {
  const dir = tmp();
  const { state } = await useAtomicAuthState(dir);
  await state.keys.set({ session: { s: Buffer.from("old") } });
  // a killed process leaves a partial temp file behind: it is not read and is cleaned up at start
  fs.writeFileSync(path.join(dir, "session-s.json.1.1.tmp"), '{"partial');
  const again = await useAtomicAuthState(dir);
  assert.equal(Buffer.from((await again.state.keys.get("session", ["s"])).s).toString(), "old");
  assert.deepEqual(fs.readdirSync(dir).filter((f) => f.endsWith(".tmp")), []);
});

test("concurrent writes to one key end with a complete, valid file", async () => {
  const dir = tmp();
  const { state } = await useAtomicAuthState(dir);
  await Promise.all(
    Array.from({ length: 50 }, (_, i) => state.keys.set({ session: { k: Buffer.from(`value-${i}`) } }))
  );
  const value = Buffer.from((await state.keys.get("session", ["k"])).k).toString();
  assert.match(value, /^value-\d+$/);
});

test("a non-directory at the session path is refused", async () => {
  const file = path.join(tmp(), "file");
  fs.writeFileSync(file, "x");
  await assert.rejects(useAtomicAuthState(file), /not a directory/);
});

// ---- SentMessages (getMessage) ----

const sent = (id, text = "hi") => ({ key: { id, fromMe: true }, message: { conversation: text } });

test("SentMessages answers getMessage for own messages only", async () => {
  const store = new SentMessages();
  store.remember(sent("A"));
  store.remember({ key: { id: "B", fromMe: false }, message: { conversation: "theirs" } });
  store.remember({ key: { id: "C", fromMe: true } }); // no content
  assert.deepEqual(await store.get({ id: "A" }), { conversation: "hi" });
  assert.equal(await store.get({ id: "B" }), undefined);
  assert.equal(await store.get({ id: "C" }), undefined);
  assert.equal(await store.get({}), undefined);
});

test("SentMessages keeps at most maxEntries, dropping the oldest", async () => {
  const store = new SentMessages(3);
  for (const id of ["1", "2", "3", "4"]) store.remember(sent(id));
  assert.equal(store.size, 3);
  assert.equal(await store.get({ id: "1" }), undefined);
  assert.ok(await store.get({ id: "4" }));
});

test("SentMessages forgets messages older than the ttl", async () => {
  const store = new SentMessages(10, 20);
  store.remember(sent("old"));
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(await store.get({ id: "old" }), undefined);
  store.remember(sent("new"));
  assert.equal(store.size, 1, "the expired entry is pruned on the next write");
});
