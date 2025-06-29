import AutoWA, { phoneToJid } from "../src";

const singleWithQR = async () => {
  const autoWA = new AutoWA("4a", { printQR: true });
  const ev = autoWA.events;

  autoWA.on("qr", (qr) => {
    console.log(qr);
  });

  // ev.on("group-member-update", async (msg) => {
  //   console.log(msg);

  //   if (msg.action == "add") {
  //     msg.replyWithText(
  //       "Hello, " +
  //         msg.participants.map((d) => "@" + phoneToJid({ from: d, reverse: true })).join(", ") +
  //         " !",
  //       {
  //         mentions: msg.participants,
  //       }
  //     );
  //   } else if (msg.action == "remove") {
  //     msg.replyWithText(
  //       "Bye, " +
  //         msg.participants.map((d) => "@" + phoneToJid({ from: d, reverse: true })).join(", ") +
  //         " !",
  //       {
  //         mentions: msg.participants,
  //       }
  //     );
  //   }
  // });

  ev.on("message-deleted", async (msg) => {
    autoWA.logger.info("Message Delete : " + JSON.stringify(msg, null, 2));
  });

  // ev.on("group-message-received", async (msg) => {
  //   await msg.replyWithText(JSON.stringify(await autoWA.getGroupInfo(msg.from), null, 2));
  // });

  ev.on("private-message-received", async (msg) => {
    autoWA.logger.info(
      "Profile : " + JSON.stringify(await autoWA.getProfileInfo(msg.from), null, 2)
    );
    await msg.read();

    const cmd = msg.text
      ? msg.text
          .split(" ")[0]
          .toLowerCase()
          .replace(/[^a-z]/g, "")
      : "";

    if (!msg.isReaction && !msg.isStory && cmd) await msg.react("⌛");

    if (cmd == "id") {
      await msg.replyWithRecording(async () => {
        await msg.replyWithText(msg.from);
      });
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
      const media =
        (await msg.downloadMedia({ asBuffer: true })) ||
        (await msg.quotedMessage?.downloadMedia({ asBuffer: true }));
      if (media) {
        await msg.replyWithSticker(null, { media });
      } else {
        return await msg.replyWithText("Please send or reply media that want to be sticker");
      }
    } else if (cmd == "hlh") {
      const text = msg.quotedMessage?.text || msg.text.split(cmd)[1].trim();
      if (text) {
        await msg.replyWithText(text);
      } else {
        return await msg.replyWithText("Please send or reply text");
      }
    }

    if (!msg.isReaction && !msg.isStory) await msg.react("");
  });

  ev.on("message", async (msg) => {
    // console.log(msg);
    // if (msg.quotedMessage) {
    //   if (msg.text == "reply") {
    //     msg.quotedMessage.replyWithText("reply bosq");
    //   }
    //   if (msg.text == "react") {
    //     msg.quotedMessage.react("💫");
    //   }
    //   if (msg.text == "forward") {
    //     msg.quotedMessage.forward("6282286230830");
    //   }
    // }
    // const run = async (msg: IWAutoMessage) => {
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
    //     const [sticker, hasMedia] = await msg.toSticker();
    //     // or
    //     // const sticker = await msg.toSticker({ pack: "whatsauto.js", author: "freack21" });
    //     if (sticker) {
    //       // reply this message with audio
    //       await msg.replyWithSticker(sticker, { hasMedia });
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
    // };
  });

  await autoWA.initialize();
};

// experimental
const singleWithPairCode = async () => {
  try {
    const autoWA = new AutoWA("4x", { phoneNumber: "6289509057782" });

    autoWA.on("pairing-code", (code) => {
      console.log(`Pairing code: ${code}`);
    });
    autoWA.events.on("connected", () => {
      console.log("connected!!");
    });

    await autoWA.initialize();
  } catch (error) {}
};
// experimental

(async () => {
  await singleWithQR();
  // await singleWithPairCode();
})();
