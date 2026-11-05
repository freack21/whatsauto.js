# WhatsAuto.js

### v0.0.3

- add reaction message event in group and private chat
- add CHANGELOG

### v0.0.4

- add MessageComplete type
- add MessageComplete class

### v0.0.4-fix

- trying to fix MessageComplete class issue

### v0.0.4-alpha

- fix MessageComplete class issue

### v0.1.0

- add default export WhatsAuto

### v0.1.1

- fix sendSticker issue

### v0.1.2

- delete debug log at sendSticker issue

### v0.1.3

- handle error when fail create sticker

### v1.2.0

- migrate from callback to eventemitter for events

### v1.2.1

- update typing function

### v1.3.0

- add message deleted event

### v2.0.0

- **breaking:** upgrade to Baileys v7 (`@whiskeysockets/baileys@^7.0.0-rc.9`), which is ESM-only and requires Node.js >= 20
- **breaking:** the package is now ESM (`"type": "module"`) with an `exports` map; use `import` instead of `require`
- upgrade `pino` to v10, add `axios`
- example moved from `example/single.ts` to `example/single.js`

### v2.0.1

- remove leftover debug log
- docs: enhance README with detailed API documentation, features and updated quick start examples

### v2.0.2

- add `loadSessions` function to restore all saved sessions from the credentials directory
- add `session(sessionId)` and `sessionsList()` helpers

### v2.0.3

- add `deleteSession(sessionId)` to destroy a session and delete its credentials

### v2.0.4

- resolve the sender from whichever of `remoteJid` / `remoteJidAlt` is a WhatsApp jid (Baileys v7 LID support)
- improve story (`status@broadcast`) detection

### v2.0.5

- fix `msg.author` for group and story messages (prefer `participantAlt` over `participant`)

### v2.1.0

- fix: credentials are no longer deleted when reconnect retries are exhausted; only on logout
- fix: pairing code is requested once the socket is open (it always failed before) and login survives WhatsApp's restart request
- fix: retry limit applies to all transient disconnect reasons, including pairing; old sockets are cleaned up on reconnect
- fix: `destroy()` during a pending reconnect no longer revives the session; closed sockets skip `logout()`
- fix: all messages in a batch are processed in `messages.upsert` / `messages.update`
- fix: `phoneToJid` preserves `@lid`, `@newsletter`, hosted/bot jids and dashed group ids
- fix: `removeAllListeners()` without an event name removes all listeners
- fix: `message-updated` reports `"unknown"` instead of `"error"` for updates without a delivery status
- fix: sessions are removed from the registry on destroy; `loadSessions` skips duplicates and non-session files
- fix: typing/recording presence is reset even if the callback throws
- fix: `forwardMessage` throws instead of silently returning undefined
- fix: `downloadMedia` falls back to `.bin` for unknown mime types, creates missing folders and rejects paths escaping the cwd
- fix: sticker creation accepts URLs, cleans temp files and never throws on invalid media
- fix: `isAutoWAError` / `isValidationError` no longer match every Error
- perf: receiver existence checks are cached for 5 minutes (bounded to 1000 entries)
- types: `strictNullChecks` enabled; reply/react/forward/downloadMedia return types include `undefined`/`null`
- chore: replace jest with node:test, add CI, commit lockfile, remove unused deps
- chore(deps): require the latest Baileys (`^7.0.0-rc14`), add `npm run check:baileys` and Dependabot
- security: upgrade `file-type` to 21.3.4 (GHSA-5v7r-6r5c-r473, infinite loop on malformed media)

### v2.2.0

- feat: `autoRestart` option (default `true`): after a logout the credentials are removed and a new QR code / pairing code is generated automatically, and the client reconnects after 30s when retries run out instead of stopping
- feat: `logged-out` event

### v2.3.0

- feat: instance-level group access, no `client.sock` needed: `getGroups()`, `getGroupParticipants()`, `getGroupAdmins()`, `isGroupAdmin()`, `isBotGroupAdmin()`, `resolveJid()`, `getBotJids()`; `getGroupInfo()` accepts `{ refresh }`
- feat: group metadata is cached (dropped per group on every group event, and on reconnect); `isExist` / `getGroupInfo` use the cache instead of asking WhatsApp each time
- feat: group events `group-joined`, `group-left`, `group-member-added`, `group-member-removed` (`reason: "left" | "removed"`), `group-member-promoted`, `group-member-demoted`; events are ordered and carry normalized participants (phone-number jid + `@lid`), the author and fresh group info
- `group-member-update` is unchanged
- fix: a group created while `getGroups()` was running is no longer missing from the next call; a bot removed from a group is forgotten by the receiver cache and can be announced again when re-added; the bot is recognised by its `@lid` even when the login doesn't report it

### v2.3.1

- fix: the session (`wa_creds/<id>`) is saved atomically (temporary file, flush, rename), so a process killed while saving can no longer leave a truncated key file. Those showed up as `Bad MAC` / `failed to decrypt` and messages missing on other devices. The folder and file layout are unchanged, existing sessions keep working
- fix: a corrupted session file is reported in the log (`[auth] ... is corrupted`) instead of being ignored silently; `creds.json` keeps a `creds.json.bak` and falls back to it, so one bad file no longer means a new login
- fix: sent messages are kept for 24 hours (max 2000) and given to Baileys' `getMessage`, so a device that asks for a message again later than Baileys' own 5-minute cache is still answered
