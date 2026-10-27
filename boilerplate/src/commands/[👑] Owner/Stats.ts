import { Command, type Context } from "../../core/Command.js";

const formatDuration = (ms: number) => {
  const total = Math.floor(ms / 1000);
  const [d, h, m, s] = [total / 86400, (total % 86400) / 3600, (total % 3600) / 60, total % 60].map(
    Math.floor,
  );
  return `${d}d ${h}h ${m}m ${s}s`;
};

export default class Stats extends Command {
  aliases = ["stats", "status"];
  description = { en: "Bot runtime statistics", id: "Statistik bot" };
  ownerOnly = true;

  async execute({ bot, reply }: Context) {
    const memory = (process.memoryUsage().rss / 1024 / 1024).toFixed(1);
    await reply(
      [
        `*${bot.config.name}*`,
        `Uptime: ${formatDuration(Date.now() - bot.startedAt)}`,
        `Commands: ${bot.registry.commands.length}`,
        `Users: ${bot.users.keys().length}`,
        `Memory: ${memory} MB`,
        `Node: ${process.version}`,
      ].join("\n"),
    );
  }
}
