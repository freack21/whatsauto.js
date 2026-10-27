import { Command, type Context } from "../../core/Command.js";

export default class Menu extends Command {
  aliases = ["menu", "commands", "list"];
  description = { en: "Show all commands", id: "Tampilkan semua perintah" };

  texts = {
    header: { en: "*{name}* — commands", id: "*{name}* — daftar perintah" },
    footer: {
      en: "Use *{prefix}help <command>* for details.",
      id: "Ketik *{prefix}help <perintah>* untuk detail.",
    },
  };

  async execute({ bot, user, lang, t, reply }: Context) {
    const isOwner = bot.isOwner(user);
    const groups = new Map<string, string[]>();

    for (const command of bot.registry.commands) {
      if (command.hidden || (command.ownerOnly && !isOwner)) continue;
      const title = `${command.group.emoji} *${command.group.name}*`;
      const lines = groups.get(title) ?? [];
      lines.push(`• ${bot.prefix}${command.aliases[0]} — ${command.describe(lang)}`);
      groups.set(title, lines);
    }

    const sections = [...groups].map(([title, lines]) => `${title}\n${lines.join("\n")}`);
    await reply(
      [t("header", { name: bot.config.name }), ...sections, t("footer", { prefix: bot.prefix })].join(
        "\n\n",
      ),
    );
  }
}
