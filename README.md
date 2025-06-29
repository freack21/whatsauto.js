# WhatsAuto.js - Easy WhatsApp Automation

An easy-to-use library for creating WhatsApp Automation App.

Stand above [Baileys](https://github.com/WhiskeySockets/Baileys) Library. This library will be lightweight library for WhatsApp. Not require Selenium or any other browser.

## 🚀 Installation

Install package using npm

```
npm i whatsauto.js@latest
```

Then import the library

```ts
import AutoWA from "whatsauto.js";
// or
import { AutoWA } from "whatsauto.js";
```

or

```js
const { default: AutoWA } = require("whatsauto.js");
```

## 🗒️ Insight

WhatsAuto.js is designed to simplify the process of automating WhatsApp tasks. By leveraging the power of the Baileys library, it provides a robust and efficient way to interact with WhatsApp without the need for browser automation tools like Selenium.

This makes it a lightweight and efficient solution for developers looking to integrate WhatsApp functionalities into their applications.

Additionally, WhatsAuto.js uses the Object-Oriented Programming (OOP) paradigm, making it an excellent choice for developers who prefer or are accustomed to OOP. This approach enhances code reusability, scalability, and maintainability, which are essential for long-term project development.

## 🪧 Examples

### Make WA Session / Client

```ts
import AutoWA from "whatsauto.js";

// using QR (default)
const autoWA = new AutoWA("session_name", { printQR: true });
// or
const autoWA = new AutoWA("session_name");
// or, using pair code (experimental)
const autoWA = new AutoWA("session_name", { phoneNumber: "628xxxx" });

autoWA.on("connected", () => {
  console.log("Client Ready!");
});

autoWA.on("message", async (msg) => {
  console.log(msg.text);
});

// initialize session
await autoWA.initialize();
```

### Session Parameters

```ts
{
  /**
   * Print logs into Terminal
   */
  logging?: boolean; // true (default), false
  /**
   * Print QR Code into Terminal
   */
  printQR?: boolean; // true (default), false
  /**
   * Phone number for session with pairing code
   */
  phoneNumber?: string; // 62822xxxxx (62 is your country code)
}
```

### IWAutoMessage APIs

```ts
autoWA.on("message-received", async (msg) => {
  // read this message
  await msg.read();

  if (msg.text == "react")
    // react this message
    await msg.react("🐾");

  if (msg.text == "text")
    // reply this message with text
    await msg.replyWithText("Hello!");

  if (msg.text == "image")
    // reply this message with image
    await msg.replyWithImage("https://picsum.photos/536/354");

  if (msg.text == "video")
    // reply this message with video
    await msg.replyWithVideo(
      "https://github.com/rafaelreis-hotmart/Audio-Sample-files/raw/master/sample.mp4"
    );

  if (msg.text == "audio")
    // reply this message with audio
    await msg.replyWithAudio(
      "https://github.com/rafaelreis-hotmart/Audio-Sample-files/raw/master/sample.mp3"
    );

  if (msg.text == "sticker") {
    // convert this message to sticker buffer (if its has media)
    const [sticker, hasMedia] = await msg.toSticker();
    // or
    // const sticker = await msg.toSticker({ pack: "whatsauto.js", author: "freack21" });
    if (hasMedia) {
      // reply this message with audio
      await msg.replyWithSticker(sticker);
    }
  }

  if (msg.text == "typing")
    // reply this message with typing presence
    await msg.replyWithTyping(async () => {
      await msg.replyWithText("This is typing"); // action to take while typing
    });

  if (msg.text == "recording")
    // reply this message with recording presence
    await msg.replyWithRecording(async () => {
      await msg.replyWithText("This is recording"); // action to take while recording
    });
});
```

### AutoWA Events

```ts
  "connecting", // => passing null;
  "qr", // => passing string;
  "pairing-code", // => passing string;
  "connected", // => passing null;
  "disconnected", // => passing null;

  "message", // => passing IWAutoMessage;
  "group-message", // => passing IWAutoMessage;
  "private-message", // => passing IWAutoMessage;
  "message-received", // => passing IWAutoMessage;
  "group-message-received", // => passing IWAutoMessage;
  "private-message-received", // => passing IWAutoMessage;
  "message-sent", // => passing IWAutoMessage;
  "group-message-sent", // => passing IWAutoMessage;
  "private-message-sent", // => passing IWAutoMessage;
  "story", // => passing IWAutoMessage;
  "story-received", // => passing IWAutoMessage;
  "story-sent", // => passing IWAutoMessage;
  "reaction", // => passing IWAutoMessage;
  "reaction-received", // => passing IWAutoMessage;
  "reaction-sent", // => passing IWAutoMessage;
  "group-reaction", // => passing IWAutoMessage;
  "group-reaction-received", // => passing IWAutoMessage;
  "group-reaction-sent", // => passing IWAutoMessage;
  "private-reaction", // => passing IWAutoMessage;
  "private-reaction-received", // => passing IWAutoMessage;
  "private-reaction-sent", // => passing IWAutoMessage;

  "message-updated", // => passing WAutoMessageUpdated;
  "group-member-update", // => passing IGroupMemberUpdate;

  "message-deleted", // => passing IWAutoDeleteMessage;
```

## 🧾 Disclaimer

This library is for educational and research purposes only. Use it responsibly and at your own risk.
