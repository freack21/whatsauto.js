import { Command, type Context } from "../../core/Command.js";

export default class Ping extends Command {
  aliases = ["ping", "p"];
  description = { en: "Check that the bot is alive", id: "Cek apakah bot aktif" };
  cooldown = 3;

  async execute({ msg, reply }: Context) {
    const sentAt = Number(msg.messageTimestamp ?? 0) * 1000;
    const latency = sentAt ? `${Math.max(Date.now() - sentAt, 0)} ms` : "-";
    await reply(`🏓 Pong! (${latency})`);
  }
}
