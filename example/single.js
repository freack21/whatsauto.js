const { default: AutoWA, sessions, phoneToJid } = require("../dist");

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
          msg.participants.map((d) => "@" + phoneToJid({ to: d, reverse: true })).join(", ") +
          " !",
        {
          mentions: [msg.participants],
        }
      );
    } else if (msg.action == "remove") {
      msg.replyWithText(
        "Bye, " +
          msg.participants.map((d) => "@" + phoneToJid({ to: d, reverse: true })).join(", ") +
          " !",
        {
          mentions: [msg.participants],
        }
      );
    }
  });

  ev.onConnected(async () => {});

  ev.onMessage(async (msg) => {
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
      const run = async () => {
        let mediaPath = "";
        if (msg.hasMedia && ["image", "video"].includes(msg.mediaType)) {
          mediaPath = await msg.downloadMedia();
        } else if (
          msg.quotedMessage &&
          msg.quotedMessage.hasMedia &&
          ["image", "video"].includes(msg.quotedMessage.mediaType)
        ) {
          mediaPath = await msg.quotedMessage.downloadMedia();
        } else {
          return await msg.replyWithText("Please send or reply media that want to be sticker");
        }

        await msg.replyWithSticker({
          filePath: mediaPath,
        });
      };

      await run();
    }

    if (!msg.isReaction && !msg.isStory) await msg.react("");
  });

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
