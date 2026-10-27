import { Command, type Context } from "../../core/Command.js";

export default class TagAll extends Command {
  aliases = ["tagall", "everyone"];
  description = { en: "Mention every group member", id: "Mention semua anggota grup" };
  groupAdminOnly = true;
  cooldown = 60;
  params = [
    {
      name: "message",
      prompt: { en: "Message to send", id: "Pesan yang dikirim" },
      required: false,
    },
  ];

  async execute({ bot, msg, params }: Context) {
    const { participants } = await bot.client.sock.groupMetadata(msg.from);
    const mentions = participants.map((participant) => participant.id);
    const lines = mentions.map((jid) => `@${jid.split("@")[0]}`);
    const text = [params.message ? String(params.message) : "📢", ...lines].join("\n");

    await bot.client.sendText({ to: msg.from, isGroup: true, text, mentions });
  }
}
