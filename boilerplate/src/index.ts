import dotenv from "dotenv";
import Bot from "./Bot.js";
import { loadConfig } from "./config.js";

dotenv.config({ quiet: true });

process.on("unhandledRejection", (reason) => {
  console.error("[process] unhandled rejection:", reason);
});

const bot = new Bot(loadConfig());

// Non-command features plug in here, e.g.:
// bot.use(async (msg) => {
//   if (msg.text?.toLowerCase() === "hi") {
//     await msg.replyWithText("Hello!");
//     return true;
//   }
// });

bot.start().catch((error) => {
  console.error("[process] failed to start:", error);
  process.exit(1);
});
