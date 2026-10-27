import { Command, type Context } from "../../core/Command.js";
import { isLang, LANGS } from "../../core/i18n.js";

export default class Language extends Command {
  aliases = ["lang", "language", "bahasa"];
  description = { en: "Change the reply language", id: "Ganti bahasa balasan" };
  params = [
    {
      name: "language",
      prompt: { en: `Choose a language: ${LANGS.join(", ")}`, id: `Pilih bahasa: ${LANGS.join(", ")}` },
      parse: (raw: string) => {
        const lang = raw.toLowerCase();
        return isLang(lang) ? lang : undefined;
      },
    },
  ];

  texts = {
    changed: { en: "Language changed to English.", id: "Bahasa diganti ke Bahasa Indonesia." },
  };

  async execute({ bot, user, params, reply }: Context) {
    const lang = params.language as (typeof LANGS)[number];
    bot.users.update(user, { lang });
    await reply(bot.t(lang, "changed", {}, this));
  }
}
