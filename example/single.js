const { StickerTypes } = require("wa-sticker-formatter");
const { AutoWA } = require("../dist/index");
const fs = require("fs");

const singleWithQR = async () => {
  const autoWA = new AutoWA("mySession", { printQR: true });
  autoWA.event.onConnected(() => {
    console.log("Connected!");
  });

  // autoWA.event.onMessageReceived(async (msg) => {
  //   if (msg.text == "-s") {
  //     await autoWA.sendReaction({ to: msg.from, text: "⌛", answering: msg });

  //     const run = async () => {
  //       let mediaPath = "";
  //       if (msg.hasMedia && ["image", "video"].includes(msg.mediaType)) {
  //         mediaPath = await msg.downloadMedia();
  //       } else if (
  //         msg.quotedMessage &&
  //         msg.quotedMessage.hasMedia &&
  //         ["image", "video"].includes(msg.quotedMessage.mediaType)
  //       ) {
  //         mediaPath = await msg.quotedMessage.downloadMedia();
  //       } else {
  //         return await autoWA.sendText({
  //           to: msg.from,
  //           text: "Please send or reply media that want to be sticker",
  //         });
  //       }

  //       const media = fs.readFileSync(mediaPath);

  //       await autoWA.sendSticker({
  //         to: msg.from,
  //         media,
  //         type: StickerTypes.FULL,
  //         quality: 100,
  //       });
  //     };

  //     await run();

  //     await autoWA.sendReaction({ to: msg.from, text: "", answering: msg });
  //   }
  // });

  autoWA.event.onQRUpdated((qr) => {
    console.log("QR Updated!", qr);
  });

  autoWA.event.onConnected(async () => {
    console.log("Connected!");
  });

  autoWA.event.onDisconnected(async () => {
    console.log("Disconnected!");
  });

  autoWA.event.onConnecting(async () => {
    console.log("Connecting...");
  });

  autoWA.event.onMessageUpdate(async (data) => {
    console.log("Message updated!", data);
  });

  autoWA.event.onPairingCode(async (code) => {
    console.log(`Pairing code: ${code}`);
  });

  autoWA.event.onMessage(async (msg) => {
    console.log("Message:", msg);
  });

  autoWA.event.onGroupMessage(async (msg) => {
    console.log("Group message:", msg);
  });

  autoWA.event.onPrivateMessage(async (msg) => {
    console.log("Private message:", msg);
  });

  autoWA.event.onMessageReceived(async (msg) => {
    console.log("Message received:", msg);
  });

  autoWA.event.onGroupMessageReceived(async (msg) => {
    console.log("Group message received:", msg);
  });

  autoWA.event.onPrivateMessageReceived(async (msg) => {
    console.log("Private message received:", msg);
  });

  autoWA.event.onMessageSent(async (msg) => {
    console.log("Message sent:", msg);
  });

  autoWA.event.onGroupMessageSent(async (msg) => {
    console.log("Group message sent:", msg);
  });

  autoWA.event.onPrivateMessageSent(async (msg) => {
    console.log("Private message sent:", msg);
  });

  autoWA.event.onStory(async (msg) => {
    console.log("Story:", msg);
  });

  autoWA.event.onStoryReceived(async (msg) => {
    console.log("Story received:", msg);
  });

  autoWA.event.onStorySent(async (msg) => {
    console.log("Story sent:", msg);
  });

  autoWA.event.onReaction(async (msg) => {
    console.log("Reaction:", msg);
  });

  autoWA.event.onReactionReceived(async (msg) => {
    console.log("Reaction received:", msg);
  });

  autoWA.event.onReactionSent(async (msg) => {
    console.log("Reaction sent:", msg);
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
