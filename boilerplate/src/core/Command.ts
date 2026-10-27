import type { IWAutoMessage } from "whatsauto.js";
import type Bot from "../Bot.js";
import { format, type Lang, type Text, type Texts, type Vars } from "./i18n.js";

/**
 * A command parameter. Values come from the arguments after the command, separated by `|`
 * (`!cmd first | second`). Missing required parameters are asked for interactively.
 */
export interface Param<T = unknown> {
  name: string;
  /** Question sent when the value is missing. */
  prompt: Text;
  /** Defaults to true. */
  required?: boolean;
  /** Convert the raw text; return `undefined` to reject it. Defaults to the trimmed text. */
  parse?: (raw: string, ctx: Context) => T | undefined;
}

export interface Context {
  bot: Bot;
  msg: IWAutoMessage;
  /** The alias the command was invoked with. */
  alias: string;
  /** Raw `|`-separated arguments. */
  args: string[];
  /** Parsed parameter values, keyed by `Param.name`. */
  params: Record<string, unknown>;
  /** Canonical sender id (`<phone>@s.whatsapp.net`). */
  user: string;
  lang: Lang;
  /** Translate a key from the command's `texts`, falling back to the core texts. */
  t(key: string, vars?: Vars): string;
  reply(text: string): Promise<unknown>;
}

export interface CommandGroup {
  name: string;
  emoji: string;
}

/**
 * Base class for commands. Put one command per file under
 * `src/commands/[<emoji>] <Group>/` and export the class as default.
 * A single instance serves every message, so keep per-message state in `ctx`.
 */
export abstract class Command {
  abstract readonly aliases: string[];
  abstract readonly description: Text;

  /** Set by the registry from the folder name. */
  group: CommandGroup = { name: "General", emoji: "📁" };
  params: Param[] = [];
  /** Only numbers listed in OWNER_NUMBERS. */
  ownerOnly = false;
  groupOnly = false;
  privateOnly = false;
  /** Sender must be a group admin (implies groupOnly). */
  groupAdminOnly = false;
  /** Hidden from the menu. */
  hidden = false;
  /** Seconds between uses per user. */
  cooldown = 0;
  /** Command-specific texts; may override core text keys. */
  texts: Texts = {};

  /** Return `false` to signal that the command failed (cooldown is not applied). */
  abstract execute(ctx: Context): Promise<boolean | void>;

  usage(prefix: string): string {
    const params = this.params
      .map((param) => (param.required === false ? `[${param.name}]` : `<${param.name}>`))
      .join(" | ");
    return `${prefix}${this.aliases[0]}${params ? ` ${params}` : ""}`;
  }

  describe(lang: Lang): string {
    return format(this.description, lang);
  }
}
