import { Command, type Context } from "../../core/Command.js";

export default class Sticker extends Command {
  aliases = ["sticker", "s", "stiker"];
  description = {
    en: "Turn an image or short video into a sticker (send or reply to media)",
    id: "Ubah gambar atau video pendek jadi stiker (kirim atau balas media)",
  };
  cooldown = 5;

  texts = {
    no_media: {
      en: "Send or reply to an image/video with this command.",
      id: "Kirim atau balas gambar/video dengan perintah ini.",
    },
    failed: { en: "Failed to create the sticker.", id: "Gagal membuat stiker." },
  };

  async execute({ bot, msg, t, reply }: Context) {
    const [sticker, hasMedia] = await msg.toSticker({ pack: bot.config.name, author: "whatsauto.js" });
    if (!hasMedia) {
      await reply(t("no_media"));
      return false;
    }
    if (!sticker) {
      await reply(t("failed"));
      return false;
    }
    await msg.replyWithSticker(sticker);
  }
}
