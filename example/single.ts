import AutoWA, { phoneToJid } from "../src";

const singleWithQR = async () => {
  const autoWA = new AutoWA("4a", { printQR: true });
  const ev = autoWA.event;

  ev.onQRUpdated((qr) => {
    console.log(qr);
  });

  ev.onGroupMemberUpdate(async (msg) => {
    console.log(msg);

    if (msg.action == "add") {
      msg.replyWithText(
        "Hello, " +
          msg.participants.map((d) => "@" + phoneToJid({ from: d, reverse: true })).join(", ") +
          " !",
        {
          mentions: msg.participants,
        }
      );
    } else if (msg.action == "remove") {
      msg.replyWithText(
        "Bye, " +
          msg.participants.map((d) => "@" + phoneToJid({ from: d, reverse: true })).join(", ") +
          " !",
        {
          mentions: msg.participants,
        }
      );
    }
  });

  ev.onConnected(async () => {});

  ev.onPrivateMessageReceived(async (msg) => {
    await msg.read();

    const cmd = msg.text
      ? msg.text
          .split(" ")[0]
          .toLowerCase()
          .replace(/[^a-z]/g, "")
      : "";

    if (!msg.isReaction && !msg.isStory && cmd) await msg.react("⌛");

    if (cmd == "id") {
      msg.replyWithTyping(1000);

      await msg.replyWithText(msg.from);
    } else if (cmd == "me") {
      console.log(await autoWA.getProfileInfo(msg.author));
    } else if (cmd == "s") {
      const [sticker, hasMedia] = await msg.toSticker();
      if (hasMedia) {
        await msg.replyWithSticker(sticker, { hasMedia });
      } else {
        return await msg.replyWithText("Please send or reply media that want to be sticker");
      }
    } else if (cmd == "st") {
      const media = await msg.downloadMedia();
      if (media) {
        await msg.replyWithSticker(null, { media });
      } else {
        return await msg.replyWithText("Please send or reply media that want to be sticker");
      }
    }

    if (!msg.isReaction && !msg.isStory) await msg.react("");
  });

  // ev.onMessageReceived(async (msg) => {
  //   // read this message
  //   await msg.read();

  //   if (msg.text == "react")
  //     // react this message
  //     await msg.react("🐾");

  //   if (msg.text == "text")
  //     // reply this message with text
  //     await msg.replyWithText("Hello!");

  //   if (msg.text == "image")
  //     // reply this message with image
  //     await msg.replyWithImage("https://picsum.photos/536/354");

  //   if (msg.text == "video")
  //     // reply this message with video
  //     await msg.replyWithVideo(
  //       "https://github.com/rafaelreis-hotmart/Audio-Sample-files/raw/master/sample.mp4"
  //     );

  //   if (msg.text == "audio")
  //     // reply this message with audio
  //     await msg.replyWithAudio(
  //       "https://github.com/rafaelreis-hotmart/Audio-Sample-files/raw/master/sample.mp3"
  //     );

  //   if (msg.text == "sticker") {
  //     // convert this message to sticker buffer (if its has media)
  //     const sticker = await msg.toSticker();
  //     // or
  //     // const sticker = await msg.toSticker({ pack: "whatsauto.js", author: "freack21" });
  //     if (sticker) {
  //       // reply this message with audio
  //       await msg.replyWithSticker(sticker);
  //     }
  //   }

  //   if (msg.text == "typing")
  //     // reply this message with typing presence
  //     await msg.replyWithTyping(1000); // 1000ms / 1s

  //   if (msg.text == "recording")
  //     // reply this message with recording presence
  //     await msg.replyWithRecording(1000); // 1000ms / 1s

  //   if (msg.text == "forward")
  //     if (!msg.quotedMessage) {
  //       // forward this message
  //       await msg.forward(msg.from);
  //     } else {
  //       // forward quoted message
  //       await autoWA.forwardMessage({
  //         to: msg.from,
  //         msg: msg.quotedMessage,
  //       });
  //     }
  // });

  await autoWA.initialize();
};

// experimental
const singleWithPairCode = async () => {
  try {
    const autoWA = new AutoWA("9c", { phoneNumber: "628xxxx" });
    const ev = autoWA.event;

    ev.onPairingCode((code) => {
      console.log(`Pairing code: ${code}`);
    });
    ev.onConnected(() => {
      console.log("Connected!");
    });
    ev.onMessage(async (msg) => {
      console.log(msg.text);
    });

    await autoWA.initialize();
  } catch (error) {}
};
// experimental

(async () => {
  await singleWithQR();
})();
