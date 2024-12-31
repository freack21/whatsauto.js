const { StickerTypes } = require("wa-sticker-formatter");
const { AutoWA } = require("../dist/index");
const fs = require("fs");

const singleWithQR = async () => {
  const autoWA = new AutoWA("mySession", { printQR: true });
  autoWA.event.onConnected(() => {
    console.log("Connected!");
  });
  autoWA.event.onMessageReceived(async (msg) => {
    if (msg.text == "-s") {
      await autoWA.sendReaction({ to: msg.from, text: "⌛", answering: msg });

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
          return await autoWA.sendText({
            to: msg.from,
            text: "Please send or reply media that want to be sticker",
          });
        }

        const media = fs.readFileSync(mediaPath);

        await autoWA.sendSticker({
          to: msg.from,
          media,
          type: StickerTypes.FULL,
          quality: 100,
        });
      };

      await run();

      await autoWA.sendReaction({ to: msg.from, text: "", answering: msg });
    }
  });

  await autoWA.initialize();
};

// experimental
const singleWithPairCode = async () => {
  const autoWA = new whatsapp.AutoWA("mySession", { phoneNumber: "628xxxx" });
  autoWA.event.onPairingCode((code) => {
    console.log(`Pairing code: ${code}`);
  });
  autoWA.event.onConnected(() => {
    console.log("Connected!");
  });
  autoWA.event.onPrivateMessageReceived((msg) => {
    console.log("Private message received:", msg);
  });
  autoWA.event.onGroupMessageReceived((msg) => {
    console.log("Group message received:", msg);
  });

  await autoWA.initialize();
};
// experimental

(async () => {
  await singleWithQR();
})();
