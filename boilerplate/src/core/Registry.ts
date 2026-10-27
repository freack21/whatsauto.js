import fs from "fs";
import { join } from "path";
import { pathToFileURL } from "url";
import { Command, type CommandGroup } from "./Command.js";

const GROUP_DIR = /^\[(.+?)\]\s*(.+)$/;
const isModule = (file: string) =>
  (file.endsWith(".js") || file.endsWith(".ts")) && !file.endsWith(".d.ts");

/** Discovers commands once at startup and looks them up by alias. */
export class Registry {
  readonly commands: Command[] = [];
  private byAlias = new Map<string, Command>();

  async load(dir: string): Promise<void> {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const match = entry.name.match(GROUP_DIR);
        const group = match
          ? { emoji: match[1], name: match[2] }
          : { emoji: "📁", name: entry.name };
        for (const file of fs.readdirSync(join(dir, entry.name)).sort()) {
          if (isModule(file)) await this.loadFile(join(dir, entry.name, file), group);
        }
      } else if (isModule(entry.name)) {
        await this.loadFile(join(dir, entry.name));
      }
    }
  }

  private async loadFile(path: string, group?: CommandGroup) {
    try {
      const { default: Ctor } = await import(pathToFileURL(path).href);
      const command = typeof Ctor === "function" ? new Ctor() : undefined;
      if (!(command instanceof Command)) {
        console.warn(`[registry] ${path} has no default Command export, skipped`);
        return;
      }
      if (group) command.group = group;
      this.register(command);
    } catch (error) {
      console.warn(`[registry] failed to load ${path}:`, error);
    }
  }

  register(command: Command): void {
    this.commands.push(command);
    for (const alias of command.aliases) {
      const key = alias.toLowerCase();
      const existing = this.byAlias.get(key);
      if (existing) {
        console.warn(`[registry] alias "${key}" already used by ${existing.constructor.name}`);
        continue;
      }
      this.byAlias.set(key, command);
    }
  }

  find(alias: string): Command | undefined {
    return this.byAlias.get(alias.toLowerCase());
  }
}
