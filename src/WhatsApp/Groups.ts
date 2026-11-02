import type {
  GroupMetadata,
  GroupParticipant,
  ParticipantAction,
  WASocket,
} from "@whiskeysockets/baileys";
import { AutoWAError } from "../Error/index.js";
import type { AutoWAEvents } from "../Defaults/index.js";
import type {
  IRepliable,
  IWAutoGroupActor,
  IWAutoGroupInfo,
  IWAutoGroupMemberEvent,
  IWAutoGroupOptions,
  IWAutoGroupParticipant,
} from "../Types/index.js";
import { phoneToJid } from "../Utils/helper.js";

/** What the manager needs from the client that owns it. */
export interface GroupHost {
  readonly sessionId: string;
  readonly logger: { debug(message: unknown): void; error(message: unknown): void };
  sock(): WASocket | undefined;
  emit<K extends keyof AutoWAEvents>(event: K, ...args: AutoWAEvents[K]): boolean;
  replyHelpers(to: string): IRepliable;
  /** Drop what the client remembers about a chat it can no longer reach (e.g. a removed group). */
  forgetChat?(jid: string): void;
}

const GROUP_TTL = 5 * 60 * 1000;
const LIST_TTL = 60 * 1000;
const JOIN_DEDUPE_MS = 15 * 1000;
const MAX_LID_CACHE = 5000;

const MEMBER_EVENTS = {
  add: "group-member-added",
  remove: "group-member-removed",
  promote: "group-member-promoted",
  demote: "group-member-demoted",
} as const;

type MemberAction = keyof typeof MEMBER_EVENTS;

interface ParticipantsUpdate {
  id: string;
  author: string;
  authorPn?: string;
  participants: GroupParticipant[];
  action: ParticipantAction;
}

/** Normalize a jid (strip the device suffix, keep `@lid` and group jids); never throws. */
const normalize = (jid?: string | null): string => {
  if (!jid) return "";
  try {
    return phoneToJid({ from: jid });
  } catch {
    return jid;
  }
};

const isAdminParticipant = (p: GroupParticipant) =>
  !!(p.admin || p.isAdmin || p.isSuperAdmin);

const idsOf = (p: Pick<GroupParticipant, "id" | "lid" | "phoneNumber">) =>
  [p.id, p.lid, p.phoneNumber].filter(Boolean).map(normalize);

/**
 * Group access for a client: cached metadata, admin checks that understand both `@lid` and
 * phone-number ids, and the group events (`group-joined`, `group-left`, `group-member-*`).
 *
 * The cache is dropped for a group whenever WhatsApp reports a change in it, and for all groups
 * on every (re)connect, so reads stay cheap without going stale.
 */
export class GroupManager {
  private cache = new Map<string, { at: number; data: GroupMetadata }>();
  private inflight = new Map<string, Promise<GroupMetadata>>();
  private versions = new Map<string, number>();
  private globalVersion = 0;
  /** Bumped on every invalidation or new group, so a `list()` that raced with one is not cached. */
  private changes = 0;
  private listedAt = 0;
  /** The bot's own `@lid` when the login didn't provide it (looked up once through the mapping). */
  private botLid?: string;
  private listInflight?: Promise<GroupMetadata[]>;
  private lidToPn = new Map<string, string>();
  private recentJoins = new Map<string, number>();
  /** Events are handled one after another, so they are delivered in the order they arrived. */
  private queue: Promise<void> = Promise.resolve();
  /** How long an event waits for fresh group info before it is delivered without it. */
  private eventFetchTimeoutMs = 10 * 1000;

  constructor(private host: GroupHost) {}

  private get sock(): WASocket {
    const sock = this.host.sock();
    if (!sock) throw new AutoWAError("Not connected yet: call initialize() first");
    return sock;
  }

  private groupJid(group: string) {
    return phoneToJid({ from: group, isGroup: true });
  }

  /** Bumped whenever a group is invalidated, so slower fetches never cache outdated data. */
  private versionOf(id: string) {
    return (this.versions.get(id) ?? 0) + this.globalVersion;
  }

  /** Forget cached data for one group, or for every group when no id is given. */
  invalidate(group?: string): void {
    this.listedAt = 0;
    this.changes++;
    if (!group) {
      this.globalVersion++;
      this.cache.clear();
      this.inflight.clear();
      return;
    }
    const id = this.groupJid(group);
    this.versions.set(id, (this.versions.get(id) ?? 0) + 1);
    this.cache.delete(id);
    this.inflight.delete(id);
  }

  /** Metadata of one group. Throws when it can't be fetched (not a member, no such group). */
  async get(group: string, { refresh = false }: IWAutoGroupOptions = {}): Promise<IWAutoGroupInfo> {
    const id = this.groupJid(group);
    const hit = this.cache.get(id);
    if (!refresh && hit && Date.now() - hit.at < GROUP_TTL) return hit.data;

    const pending = this.inflight.get(id);
    if (!refresh && pending) return pending;

    const version = this.versionOf(id);
    const promise = this.sock
      .groupMetadata(id)
      .then((data) => {
        // a group event arrived while fetching: the answer may already be outdated
        if (this.versionOf(id) === version) this.cache.set(id, { at: Date.now(), data });
        return data;
      })
      .finally(() => {
        if (this.inflight.get(id) === promise) this.inflight.delete(id);
      });
    this.inflight.set(id, promise);
    return promise;
  }

  /** Every group the bot is in. Heavy for WhatsApp, so it is cached for a minute. */
  async list({ refresh = false }: IWAutoGroupOptions = {}): Promise<IWAutoGroupInfo[]> {
    if (!refresh && this.listedAt && Date.now() - this.listedAt < LIST_TTL) {
      return [...this.cache.values()].map((entry) => entry.data);
    }
    if (this.listInflight) return this.listInflight;

    const startedAt = this.changes;
    this.listInflight = (async () => {
      const all = await this.sock.groupFetchAllParticipating();
      // a group changed (or appeared) while WhatsApp was answering: this list may already be
      // outdated, so hand it over but leave the cache alone and let the next call ask again
      if (this.changes === startedAt) {
        this.cache.clear();
        for (const [id, data] of Object.entries(all)) this.cache.set(id, { at: Date.now(), data });
        this.listedAt = Date.now();
      }
      return Object.values(all);
    })().finally(() => {
      this.listInflight = undefined;
    });
    return this.listInflight;
  }

  /** The members of a group, normalized (see `IWAutoGroupParticipant`). */
  async participants(group: string, options: IWAutoGroupOptions = {}): Promise<IWAutoGroupParticipant[]> {
    const info = await this.get(group, options);
    return Promise.all(info.participants.map((p) => this.toParticipant(p)));
  }

  async admins(group: string, options: IWAutoGroupOptions = {}): Promise<IWAutoGroupParticipant[]> {
    return (await this.participants(group, options)).filter((p) => p.isAdmin);
  }

  /** Is `user` (a phone-number jid or a `@lid`) an admin of the group? */
  async isAdmin(group: string, user: string, options: IWAutoGroupOptions = {}): Promise<boolean> {
    const info = await this.get(group, options);
    const wanted = new Set([normalize(user), await this.resolveJid(user)]);
    wanted.delete("");
    return this.hasAdmin(info, wanted);
  }

  /** Is the bot itself an admin of the group? */
  async isBotAdmin(group: string, options: IWAutoGroupOptions = {}): Promise<boolean> {
    const bot = this.botJids();
    if (!bot) return false;
    const info = await this.get(group, options);
    return this.hasAdmin(info, new Set([bot.jid, bot.lid].filter(Boolean) as string[]));
  }

  private async hasAdmin(info: IWAutoGroupInfo, wanted: Set<string>): Promise<boolean> {
    for (const p of info.participants) {
      if (!isAdminParticipant(p)) continue;
      if (idsOf(p).some((id) => wanted.has(id))) return true;
      // a member only known by its @lid: ask the LID mapping who that is
      if (normalize(p.id).endsWith("@lid") && !p.phoneNumber && wanted.has(await this.resolveJid(p.id))) {
        return true;
      }
    }
    return false;
  }

  /** The bot's own ids (phone-number jid and, when known, its `@lid`). `null` before login. */
  botJids(): { jid: string; lid?: string } | null {
    const user = this.host.sock()?.user;
    if (!user) return null;
    return { jid: normalize(user.id), lid: user.lid ? normalize(user.lid) : this.botLid };
  }

  /** Some logins don't report the bot's `@lid`: ask the mapping once, so the bot is still recognised. */
  private async ensureBotLid(): Promise<void> {
    const sock = this.host.sock();
    const user = sock?.user;
    if (!sock || !user || user.lid || this.botLid) return;
    try {
      const lid = await sock.signalRepository?.lidMapping?.getLIDForPN(normalize(user.id));
      if (lid) this.botLid = normalize(lid);
    } catch (error) {
      this.host.logger.debug(`Failed to look up the bot's lid: ${(error as Error).message}`);
    }
  }

  /**
   * Turn a `@lid` into the phone-number jid it belongs to (through the LID mapping WhatsApp
   * keeps). Anything else is only normalized; an unknown `@lid` is returned unchanged.
   */
  async resolveJid(jid?: string | null): Promise<string> {
    const id = normalize(jid);
    if (!id.endsWith("@lid")) return id;

    const cached = this.lidToPn.get(id);
    if (cached) return cached;
    try {
      const pn = await this.host.sock()?.signalRepository?.lidMapping?.getPNForLID(id);
      if (pn) {
        const resolved = normalize(pn);
        if (this.lidToPn.size >= MAX_LID_CACHE) {
          this.lidToPn.delete(this.lidToPn.keys().next().value as string);
        }
        this.lidToPn.set(id, resolved);
        return resolved;
      }
    } catch (error) {
      this.host.logger.debug(`Failed to resolve ${id}: ${(error as Error).message}`);
    }
    return id;
  }

  private async toParticipant(
    p: GroupParticipant,
    action?: MemberAction,
  ): Promise<IWAutoGroupParticipant> {
    const id = p.id;
    const isLid = normalize(id).endsWith("@lid");
    const jid = isLid ? (p.phoneNumber ? normalize(p.phoneNumber) : await this.resolveJid(id)) : normalize(id);

    // events carry the action, not the resulting role
    const isAdmin = action === "promote" ? true : action === "demote" ? false : isAdminParticipant(p);
    return {
      id,
      jid,
      lid: p.lid ?? (isLid ? id : undefined),
      phoneNumber: p.phoneNumber ?? (jid.endsWith("@s.whatsapp.net") ? jid : undefined),
      isAdmin,
      isSuperAdmin: action ? false : p.admin === "superadmin" || !!p.isSuperAdmin,
    };
  }

  private async actor(id?: string, pn?: string): Promise<IWAutoGroupActor | null> {
    const raw = id || pn;
    if (!raw) return null;
    return { id: raw, jid: await this.resolveJid(pn || raw) };
  }

  // ------------------------------------------------------------------- events

  /** Start listening to the group events of a (new) socket. Must run before other group listeners. */
  attach(sock: WASocket): void {
    this.botLid = undefined;
    sock.ev.on("groups.upsert", (groups) => {
      for (const group of groups) {
        const id = normalize(group.id);
        this.invalidate(id);
        this.cache.set(id, { at: Date.now(), data: group });
        this.enqueue("groups.upsert", () => this.onCreated(group));
      }
    });

    sock.ev.on("groups.update", (updates) => {
      for (const update of updates) if (update.id) this.invalidate(update.id);
    });

    sock.ev.on("group-participants.update", (data) => {
      // what we knew about the group before this change (useful when the bot was removed)
      const last = this.cache.get(normalize(data.id))?.data ?? null;
      // synchronous, so whoever handles the event next already sees fresh data
      this.invalidate(data.id);
      this.enqueue("group-participants.update", () => this.onParticipants(data, last));
    });
  }

  private enqueue(label: string, task: () => Promise<void>) {
    this.queue = this.queue.then(task).catch((error) => this.logFailure(label, error));
  }

  /** Fresh group info for an event; `null` when it can't be had in time. */
  private async freshInfo(groupId: string): Promise<IWAutoGroupInfo | null> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), this.eventFetchTimeoutMs);
      timer.unref?.();
    });
    try {
      return await Promise.race([this.get(groupId).catch(() => null), timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  private logFailure(event: string, error: unknown) {
    this.host.logger.error(`Failed to handle ${event}: ${(error as Error)?.message ?? error}`);
  }

  /** `true` when a join for this group was already announced a moment ago. */
  private alreadyJoined(groupId: string): boolean {
    const now = Date.now();
    for (const [id, at] of this.recentJoins) if (now - at > JOIN_DEDUPE_MS) this.recentJoins.delete(id);
    if (this.recentJoins.has(groupId)) return true;
    this.recentJoins.set(groupId, now);
    return false;
  }

  private async onCreated(group: GroupMetadata) {
    const groupId = normalize(group.id);
    if (this.alreadyJoined(groupId)) return;
    this.host.emit("group-joined", {
      ...this.host.replyHelpers(groupId),
      sessionId: this.host.sessionId,
      groupId,
      reason: "created",
      addedBy: await this.actor(group.author, group.authorPn),
      group,
    });
  }

  private async onParticipants(data: ParticipantsUpdate, last: IWAutoGroupInfo | null) {
    const { action } = data;
    if (!(action in MEMBER_EVENTS)) return; // "modify" (a member changed number) has no event of its own
    const memberAction = action as MemberAction;

    const groupId = normalize(data.id);
    await this.ensureBotLid();
    const bot = this.botJids();
    const isBot = (p: GroupParticipant) =>
      !!bot && idsOf(p).some((id) => id === bot.jid || id === bot.lid);
    const author = await this.actor(data.author, data.authorPn);
    const authorIds = [data.author, data.authorPn].filter(Boolean).map(normalize);
    const doneByThemselves = (participants: GroupParticipant[]) =>
      participants.length === 1 && idsOf(participants[0]).some((id) => authorIds.includes(id));

    const mine = data.participants.filter(isBot);
    if (memberAction === "add" && mine.length && !this.alreadyJoined(groupId)) {
      this.host.emit("group-joined", {
        ...this.host.replyHelpers(groupId),
        sessionId: this.host.sessionId,
        groupId,
        reason: "added",
        addedBy: author,
        group: await this.freshInfo(groupId),
      });
    }
    if (memberAction === "remove" && mine.length) {
      // no longer reachable: forget it, so a quick re-add is announced and sends fail clearly
      this.recentJoins.delete(groupId);
      this.host.forgetChat?.(groupId);
      this.host.emit("group-left", {
        sessionId: this.host.sessionId,
        groupId,
        reason: doneByThemselves(mine) ? "left" : "removed",
        removedBy: doneByThemselves(mine) ? null : author,
        group: last,
      });
    }

    // the bot has its own events for add / remove; promote / demote also report it
    const subjects =
      memberAction === "add" || memberAction === "remove"
        ? data.participants.filter((p) => !isBot(p))
        : data.participants;
    if (!subjects.length) return;

    const payload: IWAutoGroupMemberEvent = {
      ...this.host.replyHelpers(groupId),
      sessionId: this.host.sessionId,
      groupId,
      action: memberAction,
      participants: await Promise.all(subjects.map((p) => this.toParticipant(p, memberAction))),
      author,
      group: await this.freshInfo(groupId),
    };
    if (memberAction === "remove") payload.reason = doneByThemselves(subjects) ? "left" : "removed";

    this.host.emit(MEMBER_EVENTS[memberAction], payload);
  }
}
