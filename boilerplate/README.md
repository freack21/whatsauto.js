# WhatsAuto Bot Boilerplate

A command-based WhatsApp multi-device bot framework built on [whatsauto.js](https://www.npmjs.com/package/whatsauto.js).
It packages the architecture of a production bot into a small, typed starting point:

- **Folder-based commands**: one file per command in `src/commands/[<emoji>] <Group>/`; the menu groups them automatically.
- **Params with interactive prompts**: `!cmd a | b`. Missing required values are asked for, per chat and user, with a 5-minute timeout (`cancel`/`batal` stops).
- **Access control**: owner-only, group-only, private-only, group-admin-only and per-user cooldowns.
- **LID-aware identity**: Baileys v7 `@lid` senders are resolved to `<phone>@s.whatsapp.net`, so owners, admins and user data stay consistent.
- **i18n**: English and Indonesian texts, per-user language (`!lang`).
- **Safe storage**: JSON store with in-memory cache and atomic writes; corrupt files are never overwritten.
- **Crash safety**: every message is handled in isolation, and failures get a friendly reply.
- **Interceptors**: plug non-command features (games, auto replies, AFK…) in with `bot.use()`.

## Requirements

- Node.js 20 or newer
- ffmpeg (for stickers)

## Quick start

```bash
npx degit freack21/whatsauto.js/boilerplate my-bot
cd my-bot
npm install
cp .env.example .env   # set OWNER_NUMBERS at least
npm run dev            # scan the QR code with WhatsApp → Linked devices
```

Set `PAIRING_NUMBER` in `.env` to log in with a pairing code instead of a QR code.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Run from source with `tsx` |
| `npm run build` | Compile to `dist/` |
| `npm start` | Build, then run `dist/index.js` (use pm2 or similar in production) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Build, then run the `node:test` suites in `test/` |
| `npm run check:whatsauto` | Check whether whatsauto.js is on its latest release |

## Configuration (`.env`)

| Variable | Default | Description |
|---|---|---|
| `BOT_NAME` | `WhatsAuto Bot` | Name shown in menus and sticker packs |
| `SESSION_ID` | `main` | Credentials are stored in `<CREDENTIALS_DIR>/<SESSION_ID>_creds` |
| `CREDENTIALS_DIR` | `wa_creds` | Folder for login credentials |
| `PAIRING_NUMBER` | _(empty)_ | Phone number for pairing-code login; empty = QR code |
| `OWNER_NUMBERS` | _(empty)_ | Comma-separated owner numbers, e.g. `6281234567890` |
| `PREFIXES` | `!.-/#` | Characters accepted as command prefix |
| `PREFIXLESS` | `false` | Also accept commands without a prefix |
| `DEFAULT_LANG` | `id` | `en` or `id` for new users |
| `DATA_DIR` | `data` | Runtime data (`users.json`) |

## Writing a command

Create `src/commands/[🎲] Fun/Roll.ts`:

```ts
import { Command, type Context } from "../../core/Command.js";

export default class Roll extends Command {
  aliases = ["roll", "dice"];
  description = { en: "Roll a dice", id: "Lempar dadu" };
  cooldown = 3;
  params = [
    {
      name: "sides",
      prompt: { en: "How many sides?", id: "Berapa sisi?" },
      required: false,
      parse: (raw: string) => {
        const sides = Number(raw);
        return Number.isInteger(sides) && sides > 1 ? sides : undefined;
      },
    },
  ];
  texts = {
    result: { en: "🎲 You rolled {value}", id: "🎲 Hasilnya {value}" },
  };

  async execute({ params, t, reply }: Context) {
    const sides = (params.sides as number | undefined) ?? 6;
    await reply(t("result", { value: 1 + Math.floor(Math.random() * sides) }));
  }
}
```

It is picked up automatically (restart the bot) and appears in `!menu` under **🎲 Fun**.

**Command options**

| Field | Purpose |
|---|---|
| `aliases` | Names that trigger the command (first one is shown in menus) |
| `description` | Text or `{ en, id }` |
| `params` | `{ name, prompt, required?, parse? }`; values come from `!cmd a \| b` or from interactive prompts. `parse` returns `undefined` to reject a value |
| `ownerOnly` / `groupOnly` / `privateOnly` / `groupAdminOnly` | Access rules |
| `cooldown` | Seconds between uses per user |
| `hidden` | Hide from `!menu` |
| `texts` | Command texts for `ctx.t(key, vars)`; may override core texts |

`execute(ctx)` receives `bot`, `msg` (whatsauto.js message with `replyWithImage`, `toSticker`, `downloadMedia`, …), `alias`, `args`, `params`, canonical `user`, `lang`, `t()` and `reply()`. Return `false` when the command failed, so its cooldown is not applied.

A single instance serves every message, so keep per-message state in local variables, not on `this`.

## Non-command features

Interceptors receive every message that isn't a prefixed command (and run before prefixless commands). Return `true` to consume it:

```ts
bot.use(async (msg, bot) => {
  if (msg.text?.toLowerCase() === "hi") {
    await msg.replyWithText(`Hello from ${bot.config.name}!`);
    return true;
  }
});
```

## Project layout

```
src/
  index.ts            entry point (process handlers, interceptors)
  config.ts           .env parsing
  Bot.ts              client, routing, permissions, sessions, identity
  core/
    Command.ts        base class and Context
    Registry.ts       command discovery
    Sessions.ts       interactive sessions
    Store.ts          JSON store (data/users.json)
    i18n.ts           languages and core texts
    json.ts           safe JSON read / atomic write
  commands/[<emoji>] <Group>/*.ts
test/                 node:test suites (run against dist/)
```

## Keeping whatsauto.js up to date

Run `npm run check:whatsauto`. When it reports an update, run `npm install whatsauto.js@latest`, read the
[changelog](https://github.com/freack21/whatsauto.js/blob/main/CHANGELOG.md), then `npm run typecheck && npm test`.
