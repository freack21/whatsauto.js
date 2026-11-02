# WhatsAuto.js - Lightweight WhatsApp Automation

**WhatsAuto.js** is a powerful, lightweight, and easy-to-use library for building WhatsApp automation applications using Node.js. Built on top of the robust [Baileys](https://github.com/WhiskeySockets/Baileys) library, it provides a high-level, Object-Oriented interface to interact with WhatsApp without the overhead of browser automation tools like Selenium or Puppeteer.

## ✨ Features

- **🚀 Lightweight & Fast**: Runs directly on Node.js using WebSocket connections. No browser required.
- **🔑 Flexible Authentication**: Supports both **QR Code** scanning and **Pairing Code** (phone number) login methods.
- **📦 Object-Oriented Design**: Clean class-based architecture (`AutoWA`) making it easy to manage sessions and logic.
- **💬 Rich Message Support**: Send and receive Text, Images, Videos, Audio (Voice Notes), Documents, and Stickers easily.
- **⚡ Event-Driven**: Listen to real-time events like `message`, `group-participants.update`, `connection.update`, etc.
- **👥 Group Management**: Create tools to manage groups (add, remove, promote, demote members).
- **🛠️ Developer Friendly**: Written in TypeScript with full type definitions included.

---

## 📥 Installation

Install the package via npm:

```bash
npm install whatsauto.js
```

> **Requirement:** Node.js **>= 20** (required by Baileys v7). The package is ESM-only (`import`, not `require`).

---

## 🚀 Quick Start

### 1. Initialize a Client

You can start a session using either a QR Code (default) or a Pairing Code.

**Option A: Using QR Code**
```ts
import { AutoWA } from "whatsauto.js";

const client = new AutoWA("my-session", {
  printQR: true, // Prints QR code in the terminal
  logging: true, // Enable logs
});

client.initialize();

client.on("connected", () => {
  console.log("✅ Client is ready!");
});
```

**Option B: Using Pairing Code**
```ts
import { AutoWA } from "whatsauto.js";

const client = new AutoWA("my-session", {
  phoneNumber: "6281234567890", // Your phone number (Country Code + Number)
});

client.initialize();

client.on("pairing-code", (code) => {
  console.log(`🔑 Pairing Code: ${code}`);
});

client.on("connected", () => {
  console.log("✅ Client is ready!");
});
```

### 2. Handling Messages

Listen to the `message` event to handle incoming messages. The `msg` object comes with built-in helper methods!

```ts
client.on("message", async (msg) => {
  if (msg.key.fromMe) return; // Ignore messages from yourself

  console.log(`📩 New Message from ${msg.from}: ${msg.text}`);

  if (msg.text === "!ping") {
    // Reply directly using the message object
    await msg.replyWithText("Pong! 🏓");
  }

  if (msg.text === "!sticker" && msg.hasMedia) {
    // Convert received image/video to sticker
    const [stickerBuffer] = await msg.toSticker({ pack: "MyBot", author: "Me" });
    if (stickerBuffer) {
      await msg.replyWithSticker(stickerBuffer);
    }
  }
});
```

---

## 🤖 Bot Boilerplate

Want a full command-based bot instead of wiring events yourself? Start from the official boilerplate: folder-based commands, interactive params, owner/admin checks, cooldowns, i18n and LID-aware identity, all built on whatsauto.js.

```bash
npx degit freack21/whatsauto.js/boilerplate my-bot
```

See [`boilerplate/README.md`](./boilerplate/README.md) for details.

---

## 📚 Core Concepts & API

### `AutoWA` Class
The main entry point for the library.

**Constructor**
`new AutoWA(sessionId: string, options?: IWAutoSessionConfig)`

- `sessionId`: Unique identifier for the session (auth credentials will be saved under this name).
- `options`:
  - `printQR`: (boolean) Auto-print QR in terminal.
  - `autoRestart`: (boolean, default `true`) Keep the session alive: after a logout (device unlinked from the phone) the old credentials are removed and a new QR code / pairing code is generated automatically; when reconnect retries run out it tries again after 30 seconds. `destroy()` and a replaced connection (session opened elsewhere) still stop it. Set `false` to stop on disconnect like before.
  - `phoneNumber`: (string) Use pairing code with this number.
  - `logging`: (boolean) Enable/disable console logs.

**Main Methods**
| Method | Description |
| :--- | :--- |
| `initialize()` | Starts the WhatsApp connection. |
| `destroy(full?)` | Stops the session. If `full` is true, deletes session files. |
| `sendText({ to, text })` | Sends a text message. |
| `sendImage({ to, media, text })` | Sends an image (URL or Buffer). |
| `sendVideo({ to, media, text })` | Sends a video. |
| `sendAudio({ to, media, voiceNote })` | Sends audio. Set `voiceNote: true` for PTT (Push-to-Talk). |
| `sendDocument({ to, media, filename })` | Sends a file/document. |
| `sendSticker({ to, sticker })` | Sends a sticker (Buffer). |
| `getProfileInfo(jid)` | Get status and profile picture of a user. |
| `getGroupInfo(jid)` | Get group metadata (participants, description, etc.). Cached, see *Groups* below. |
| `getGroups()` | Every group the bot is in. |
| `forwardMessage({ to, msg })` | Forwards a message. Throws an error if forwarding fails (wrap it in `try/catch`). |

**Group Management Methods**
- `addMemberToGroup({ to, participants })`
- `removeMemberFromGroup({ to, participants })`
- `promoteMemberGroup({ to, participants })`
- `demoteMemberGroup({ to, participants })`

---

### `IWAutoMessage` Object
When an event triggers, you receive an `IWAutoMessage` object. It wraps the raw Baileys message with useful properties and methods.

**Properties**
- `from`: Sender's JID.
- `text`: Message content (Text/Caption).
- `hasMedia`: Boolean, true if message contains media.
- `mediaType`: 'image', 'video', 'audio', etc.
- `isGroup`: Boolean.
- `isStory`: Boolean.
- `quotedMessage`: The message this message is replying to (if any).

**Helper Methods (Context-Aware)**
These methods automatically reply to the current message (quote it).

- `msg.replyWithText("Hello")`
- `msg.replyWithImage("http://...", { text: "Caption" })`
- `msg.replyWithSticker(buffer)`
- `msg.react("❤️")`
- `msg.read()` - Mark as read.
- `msg.downloadMedia()` - Downloads media to disk or buffer.
- `msg.toSticker()` - Converts the message's media to a sticker buffer.

---

## ⚡ Events (`client.on`)

| Event Name | Description |
| :--- | :--- |
| `qr` | Emitted when a new QR code is generated. Access the QR string as the first argument. |
| `pairing-code` | Emitted when a pairing code is requested. |
| `connecting` | Connection is being established. |
| `connected` | Client is successfully connected to WhatsApp. |
| `disconnected` | Client disconnected. |
| `logged-out` | The session was logged out from the phone; with `autoRestart` a new QR / pairing code follows. |
| `message` | Emitted for **ALL** incoming messages (private, group, status). |
| `group-message` | Emitted only for group messages. |
| `private-message` | Emitted only for private chats. |
| `message-deleted` | Emitted when a message is deleted (Revoke). |
| `group-joined` | The bot was added to a group, or a new group was created with it. |
| `group-left` | The bot left a group or was removed from it. |
| `group-member-added` | Members were added to (or joined) a group. |
| `group-member-removed` | Members left or were removed (`reason: "left" \| "removed"`). |
| `group-member-promoted` | Members became admins. |
| `group-member-demoted` | Members lost admin. |
| `group-member-update` | Every participant change in one event (`action`: add, remove, promote, demote, modify). |

---

## 🛠️ Advanced Usage

### Handling Media
Downloading media from a message is simple:

```ts
client.on("message", async (msg) => {
  if (msg.hasMedia) {
    // defaults: saves to 'my_media.{ext}' in current dir
    const filePath = await msg.downloadMedia(); 
    console.log(`Media saved at: ${filePath}`);
    
    // OR get as buffer
    // const buffer = await msg.downloadMedia({ asBuffer: true });

    // OR save to a custom path (relative to the current working directory)
    // const filePath = await msg.downloadMedia({ path: "media/photo" });
  }
});
```

> **Note:** `downloadMedia({ path })` always saves inside the current working directory; missing folders are created and paths escaping it (e.g. `../../etc/x`) are rejected. Unknown mime types are saved with a `.bin` extension. Use `{ asBuffer: true }` to store media anywhere else yourself.

### Phone Numbers & JIDs
`phoneToJid` converts a phone number into a WhatsApp JID. Device suffixes (`:12`) are stripped; `@lid` (linked-identity) ids, group ids (including old dashed ids), `@newsletter`, broadcast and other server JIDs (e.g. `@hosted`, `@bot`) keep their server:

```ts
import { phoneToJid } from "whatsauto.js";

phoneToJid({ from: "6281234567890" });            // "6281234567890@s.whatsapp.net"
phoneToJid({ from: "123456789012345@lid" });      // "123456789012345@lid"
```

### Groups
Group access lives on the client, so you never need `client.sock`:

```ts
const groups = await client.getGroups();              // every group the bot is in
const info = await client.getGroupInfo(groupJid);      // one group's metadata
const members = await client.getGroupParticipants(groupJid);
const admins = await client.getGroupAdmins(groupJid);

await client.isGroupAdmin(groupJid, msg.author);       // phone-number jid or @lid
await client.isBotGroupAdmin(groupJid);
await client.resolveJid("123456789@lid");              // → "628…@s.whatsapp.net" when known
client.getBotJids();                                   // { jid, lid }
```

Group data is cached (`getGroups()` for a minute, a single group for five minutes). The cache of a
group is dropped as soon as WhatsApp reports a change in it, and everything is dropped on
(re)connect. Pass `{ refresh: true }` to force a fresh fetch.

WhatsApp can address the same person by phone number or by `@lid` depending on the group. Members are
returned as `{ id, jid, lid, phoneNumber, isAdmin, isSuperAdmin }`: `id` is how WhatsApp names them in
that group (use it to mention), `jid` is the phone-number jid when it is known (use it to compare
people across chats).

### Group events
```ts
client.on("group-joined", async (e) => {
  // the bot was added (or a group was created with it)
  await e.replyWithText(`Hi everyone, I'm ${e.group?.subject ?? "here"}'s new bot!`);
});

client.on("group-member-added", async (e) => {
  // e.participants = members added, e.author = who added them, e.group = fresh group info
  const mentions = e.participants.map((p) => p.id);
  await e.replyWithText(`Welcome ${mentions.map((id) => "@" + id.split("@")[0]).join(", ")}!`, { mentions });
});

client.on("group-member-removed", (e) => {
  console.log(e.reason === "left" ? "someone left" : "someone was removed", e.participants);
});

client.on("group-member-promoted", (e) => { /* e.participants, e.author */ });
client.on("group-member-demoted", (e) => { /* e.participants, e.author */ });
client.on("group-left", (e) => { /* the bot is gone: e.reason, e.removedBy, e.group (last known) */ });
```

- One event per change, however many members it covers (adding 20 people is one event).
- The bot never appears in `group-member-added` / `group-member-removed`: it has `group-joined` and
  `group-left`. It can appear in promote / demote events.
- Events are delivered in the order they arrived, with `group` already refreshed (or `null` if
  WhatsApp didn't answer within 10 seconds).
- `group-member-update` still fires for every change, as before.

---

## 🧑‍💻 Development

Requires Node.js >= 20.

```bash
npm install       # install dependencies (uses the committed package-lock.json)
npm run build     # compile TypeScript to dist/
npm run typecheck # type-check without emitting
npm test          # build, then run the tests in test/*.test.mjs with Node's built-in test runner
npm run example   # build, then run example/single.js
```

Tests are plain ES modules (`test/*.test.mjs`) using `node:test` and import the compiled output from `../dist/`.

---

## 📄 License

This library is essentially a wrapper around Baileys and is provided for educational purposes. Use responsibly.
ISC License.
