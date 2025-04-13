import { ParticipantAction, WAMessageUpdate, proto } from "@whiskeysockets/baileys";

export interface IWAutoSendMessage {
  to: string | number;
  text?: string;
  isGroup?: boolean;
  answering?: proto.IWebMessageInfo;
  mentions?: string[];
}

export interface IWAutoForwardMessage {
  to: string | number;
  msg: proto.IWebMessageInfo;
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
   * Duration of your typing display
   */
  duration: number;
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

export interface Repliable {
  /**
   * reply this message with text
   */
  replyWithText: (text: string, opts?: Partial<IWAutoSendMessage>) => Promise<proto.WebMessageInfo>;

  /**
   * reply this message with Audio
   */
  replyWithAudio: (
    media: string | Buffer,
    data?: Partial<IWAutoSendMedia>
  ) => Promise<proto.WebMessageInfo>;

  /**
   * reply this message with Video
   */
  replyWithVideo: (
    media: string | Buffer,
    data?: Partial<IWAutoSendMedia>
  ) => Promise<proto.WebMessageInfo>;

  /**
   * reply this message with Image
   */
  replyWithImage: (
    media: string | Buffer,
    data?: Partial<IWAutoSendMedia>
  ) => Promise<proto.WebMessageInfo>;

  /**
   * reply this message with Sticker
   */
  replyWithSticker: (
    sticker: Buffer | null,
    data?: Partial<IWAutoSendSticker & IStickerOptions>
  ) => Promise<proto.WebMessageInfo>;

  /**
   * reply this message with Typing
   */
  replyWithTyping: (duration: number) => Promise<void>;

  /**
   * reply this message with Recording
   */
  replyWithRecording: (duration: number) => Promise<void>;
}

export interface IWAutoMessage extends proto.IWebMessageInfo, Repliable {
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
  quotedMessage: IWAutoMessage;

  /**
   * @param path save media location path without extension
   * @example "my_media"
   */
  downloadMedia: (opts?: IWAutoDownloadMedia) => Promise<string | Buffer>;

  /**
   * react this message
   */
  react: (reaction: string) => Promise<proto.WebMessageInfo>;

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
  ) => Promise<proto.IWebMessageInfo>;
}

export interface IWAutoMessageReceived extends IWAutoMessage {
  /**
   * Message sender Jid
   */
  from: string;
}

export interface IWAutoMessageSent extends IWAutoMessage {
  /**
   * Message sender Jid
   */
  receiver: string;
}

export type WAutoMessageComplete = IWAutoMessageReceived & IWAutoMessageSent;

export type WAutoMessageUpdated = WAMessageUpdate & {
  /**
   * Your Session ID
   */
  sessionId: string;
  /**
   * Message Updated Status
   */
  messageStatus: "error" | "pending" | "server" | "delivered" | "read" | "played";
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
}

export interface IStickerOptions {
  media: string | Buffer | null;
  pack?: string;
  author?: string;
}

export interface GroupMemberUpdate extends Repliable {
  sessionId: string;

  /**
   * group Jid
   */
  id: string;
  author: string;
  participants: string[];
  action: ParticipantAction;
}

export interface WAutoGroupMemberActionOptions {
  participants: string[];
  to: string;
}
