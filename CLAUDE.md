# whatsauto.js

TypeScript (ESM, `module: nodenext`) wrapper around [Baileys](https://github.com/WhiskeySockets/Baileys) for WhatsApp automation.

## Layout

- `src/WhatsApp/AutoWA.ts` — core client: connection/reconnect, message parsing, send helpers, group actions
- `src/WhatsApp/index.ts` — session registry (`sessions`, `loadSessions`, `deleteSession`)
- `src/Utils/` — `phoneToJid`, mime/context helpers, sticker creation
- `src/Types/`, `src/Defaults/`, `src/Error/`, `src/Logger/`
- `test/*.test.mjs` — `node:test` suites run against the compiled `dist/`

## Commands

- `npm run typecheck` — `tsc --noEmit`
- `npm test` — build, then `node --test`
- `npm run example` — build, then run `example/single.js`
- `npm run check:baileys` — compare installed/declared Baileys with the latest npm release

## Rules

- **Baileys must always be the latest release.** At the start of every session, and before
  any change, run `npm run check:baileys`. If the latest release is newer than the installed or declared
  version, run `npm install @whiskeysockets/baileys@latest`, review the Baileys changelog for
  breaking changes, run `npm run typecheck && npm test`, and commit `package.json` and
  `package-lock.json` as `chore(deps): bump baileys to <version>`.
- **Git identity:** commit as `freack21 <fixri2104@gmail.com>` (`git config user.name` /
  `user.email` in this repo). No AI co-author trailers.
- **Branches:** descriptive names such as `fix/reconnect-credential-wipe` or
  `feat/group-invite-links`.
- **Merging:** bring changes into a target branch with `git pull origin <branch>` while on
  the target branch.
- Commits follow Conventional Commits in English.
