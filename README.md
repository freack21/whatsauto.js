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

## 📚 Core Concepts & API

### `AutoWA` Class
The main entry point for the library.

**Constructor**
`new AutoWA(sessionId: string, options?: IWAutoSessionConfig)`

- `sessionId`: Unique identifier for the session (auth credentials will be saved under this name).
- `options`:
  - `printQR`: (boolean) Auto-print QR in terminal.
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
| `getGroupInfo(jid)` | Get group metadata (participants, description, etc.). |

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
| `message` | Emitted for **ALL** incoming messages (private, group, status). |
| `group-message` | Emitted only for group messages. |
| `private-message` | Emitted only for private chats. |
| `message-deleted` | Emitted when a message is deleted (Revoke). |
| `group-participants.update`| Emitted when members join, leave, or are promoted/demoted in a group. |

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
  }
});
```

### Group Member Updates
Welcome new members:
```ts
client.on("group-member-update", async (update) => {
  if (update.action === "add") {
    // update.id = Group JID
    // update.participants = Array of new members
    
    // You can reply directly to the update event!
    await update.replyWithText(`Welcome to the group! 👋`);
  }
});
```

---

## 📄 License

This library is essentially a wrapper around Baileys and is provided for educational purposes. Use responsibly.
ISC License.
