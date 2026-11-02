import {
  GroupMetadata,
  GroupParticipant,
  ParticipantAction,
  WAMessage,
  WAMessageKey,
  WAMessageUpdate,
  proto,
} from "@whiskeysockets/baileys";

export interface IWAutoSendMessage {
  to: string | number;
  text?: string;
  isGroup?: boolean;
  answering?: WAMessage;
  mentions?: string[];
}

export interface IWAutoForwardMessage {
  to: string | number;
  msg: WAMessage;
  isGroup?: boolean;
  mentions?: string[];
}

export interface IWAutoPhoneToJid {
  from: string | number;
  isGroup?: boolean;
  reverse?: boolean;
}

export interface IWAutoSendMedia extends IWAutoSendMessage {
  /**
   * Media you want to send
   */
  media: string | Buffer;
  sticker?: Buffer;
  voiceNote?: boolean;
  failMsg?: string;
}

export interface IWAutoSendSticker extends IWAutoSendMessage {
  /**
   * media you want to be sticker
   */
  media?: Buffer | string;
  /**
   * Sticker you want to send
   */
  sticker?: Buffer | null;
  hasMedia?: boolean;
  failMsg?: string;
}

export interface IWAutoSendTyping extends IWAutoSendMessage {
  /**
   * callback function for action to take
   */
  callback: () => Promise<void>;
}

export interface IWAutoDownloadMedia {
  /**
   * path of your downloaded media
   */
  path?: string;
  /**
   * return this function as buffer
   */
  asBuffer?: boolean;
}

export interface IRepliable {
  /**
   * reply this message with text
   */
  replyWithText: (text: string, opts?: Partial<IWAutoSendMessage>) => Promise<WAMessage | undefined>;

  /**
   * reply this message with Audio
   */
  replyWithAudio: (media: string | Buffer, data?: Partial<IWAutoSendMedia>) => Promise<WAMessage | undefined>;

  /**
   * reply this message with Video
   */
  replyWithVideo: (media: string | Buffer, data?: Partial<IWAutoSendMedia>) => Promise<WAMessage | undefined>;

  /**
   * reply this message with Image
   */
  replyWithImage: (media: string | Buffer, data?: Partial<IWAutoSendMedia>) => Promise<WAMessage | undefined>;

  /**
   * reply this message with Sticker
   */
  replyWithSticker: (
    sticker: Buffer | null,
    data?: Partial<IWAutoSendSticker & IStickerOptions>
  ) => Promise<WAMessage | undefined>;

  /**
   * reply this message with Typing
   */
  replyWithTyping: (callback: () => Promise<void>) => Promise<void>;

  /**
   * reply this message with Recording
   */
  replyWithRecording: (callback: () => Promise<void>) => Promise<void>;
}

export interface IWAutoMessage extends WAMessage, IRepliable {
  /**
   * This Message ID
   */
  key: WAMessageKey;

  /**
   * Your Session ID
   */
  sessionId: string;

  /**
   * Message author Jid
   */
  author: string;

  /**
   * Is this message have media?
   */
  hasMedia: boolean;

  /**
   * Media type of this message
   */
  mediaType: string;

  /**
   * Text of this message
   */
  text: string;

  /**
   * is this message a story?
   */
  isStory: boolean;

  /**
   * is this message from a group?
   */
  isGroup: boolean;

  /**
   * is this message a reaction?
   */
  isReaction: boolean;

  /**
   * Quoted message by this message
   */
  quotedMessage?: IWAutoMessage | null;

  /**
   * @param path save media location path without extension
   * @example "my_media"
   */
  downloadMedia: (opts?: IWAutoDownloadMedia) => Promise<string | Buffer | null>;

  /**
   * react this message
   */
  react: (reaction: string) => Promise<WAMessage | undefined>;

  /**
   * read this message
   */
  read: () => Promise<void>;

  /**
   * convert this message to sticker
   * @returns [sticker: Buffer, hasMedia: boolean]
   */
  toSticker: (props?: Omit<IStickerOptions, "media">) => Promise<[Buffer | null, boolean]>;

  /**
   * forward this message
   */
  forward: (
    to: string | number,
    props?: Partial<IWAutoForwardMessage>
  ) => Promise<proto.IWebMessageInfo | undefined>;

  /**
   * Message sender Jid
   */
  from: string;

  /**
   * Message sender Jid
   */
  receiver: string;
}

export type WAutoMessageUpdated = WAMessageUpdate & {
  /**
   * Your Session ID
   */
  sessionId: string;
  /**
   * Message Updated Status
   */
  messageStatus: "error" | "pending" | "server" | "delivered" | "read" | "played" | "unknown";
};

export interface IWAutoSessionConfig {
  /**
   * Print logs into Terminal
   */
  logging?: boolean;
  /**
   * Print QR Code into Terminal
   */
  printQR?: boolean;
  /**
   * Phone number for session with pairing code
   */
  phoneNumber?: string;
  /**
   * Keep the session alive (default `true`): after a logout the old credentials are removed
   * and a new QR code / pairing code is generated, and when reconnect retries run out the
   * client tries again after a pause. `destroy()` and a replaced connection still stop it.
   */
  autoRestart?: boolean;
}

export interface IStickerOptions {
  media: string | Buffer | null;
  pack?: string;
  author?: string;
}

export interface IGroupMemberUpdate extends IRepliable {
  sessionId: string;

  /**
   * group Jid
   */
  id: string;
  author: string;
  participants: GroupParticipant[];
  action: ParticipantAction;
}

export interface IWAutoGroupMemberActionOptions {
  participants: string[];
  to: string;
}

export interface IWAutoDeleteMessage extends IWAutoMessage {
  deletedMessage: IWAutoMessage;
}

export type IWAutoGroupInfo = GroupMetadata;

export interface IWAutoGroupOptions {
  /**
   * Skip the cache and ask WhatsApp again (groups are cached for a few minutes and the cache
   * is dropped whenever a group event arrives).
   */
  refresh?: boolean;
}

/** A group member, normalized so it can be compared however WhatsApp addresses it. */
export interface IWAutoGroupParticipant {
  /** The id WhatsApp uses for this member in this group (a `@lid` or a phone-number jid). */
  id: string;
  /** Phone-number jid (`<number>@s.whatsapp.net`) when it is known, otherwise the same as `id`. */
  jid: string;
  lid?: string;
  phoneNumber?: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
}

/** The person who caused a group event (who added, removed, promoted or demoted someone). */
export interface IWAutoGroupActor {
  id: string;
  /** Phone-number jid when it is known, otherwise the same as `id`. */
  jid: string;
}

export interface IWAutoGroupMemberEvent extends IRepliable {
  sessionId: string;
  /** Group jid. */
  groupId: string;
  action: "add" | "remove" | "promote" | "demote";
  /**
   * Only for `remove`: `"left"` when the member left on their own, `"removed"` when an
   * admin removed them.
   */
  reason?: "left" | "removed";
  /**
   * The members the event is about. For `add` and `remove` the bot itself is never listed
   * (see `group-joined` / `group-left`); for `promote` and `demote` it can be.
   */
  participants: IWAutoGroupParticipant[];
  /** Who did it (the member itself when `reason` is `"left"`), `null` when unknown. */
  author: IWAutoGroupActor | null;
  /** The group right after the change (members already updated), `null` if it could not be fetched. */
  group: IWAutoGroupInfo | null;
}

/** The bot was added to a group (or a new group was created with the bot in it). */
export interface IWAutoGroupJoinedEvent extends IRepliable {
  sessionId: string;
  groupId: string;
  reason: "added" | "created";
  /** Who added the bot (or created the group), `null` when unknown. */
  addedBy: IWAutoGroupActor | null;
  group: IWAutoGroupInfo | null;
}

/** The bot is no longer in a group: it left or was removed. */
export interface IWAutoGroupLeftEvent {
  sessionId: string;
  groupId: string;
  reason: "left" | "removed";
  /** Who removed the bot, `null` when unknown. */
  removedBy: IWAutoGroupActor | null;
  /** Last known group info from the cache, `null` if the group was never cached. */
  group: IWAutoGroupInfo | null;
}
