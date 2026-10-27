import { Command, type Context } from "../../core/Command.js";

export default class Help extends Command {
  aliases = ["help", "h"];
  description = { en: "Show how to use a command", id: "Cara memakai sebuah perintah" };
  params = [
    {
      name: "command",
      prompt: { en: "Which command?", id: "Perintah yang mana?" },
    },
  ];

  texts = {
    not_found: { en: "Command *{name}* not found.", id: "Perintah *{name}* tidak ditemukan." },
    detail: {
      en: "*{name}*\n{description}\n\nUsage: {usage}\nAliases: {aliases}",
      id: "*{name}*\n{description}\n\nCara pakai: {usage}\nAlias: {aliases}",
    },
  };

  async execute({ bot, user, params, lang, t, reply }: Context) {
    const name = String(params.command).replace(/^\W+/, "").toLowerCase();
    const command = bot.registry.find(name);
    if (!command || command.hidden || (command.ownerOnly && !bot.isOwner(user))) {
      await reply(t("not_found", { name }));
      return false;
    }

    await reply(
      t("detail", {
        name: command.aliases[0],
        description: command.describe(lang),
        usage: command.usage(bot.prefix),
        aliases: command.aliases.join(", "),
      }),
    );
  }
}
