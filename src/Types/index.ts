import { WAMessageUpdate, proto } from "@whiskeysockets/baileys";

export interface IWAutoSendMessage {
  to: string | number;
  text?: string;
  isGroup?: boolean;
  answering?: proto.IWebMessageInfo;
}

export interface IWAutoSendMedia extends IWAutoSendMessage {
  /**
   * Media you want to send
   */
  media?: string | Buffer;
}
export interface IWAutoSendTyping extends IWAutoSendMessage {
  /**
   * Duration of your typing display
   */
  duration: number;
}
export interface IWAutoSendRead {
  /**
   * The key of message you want to mark as read
   */
  key: proto.IMessageKey;
}

export interface IWAutoMessage extends proto.IWebMessageInfo {
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
   * @example "./my_media"
   */
  downloadMedia: (path: string) => Promise<string>;
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
   * Print QR Code into Terminal
   */
  printQR?: boolean;
  /**
   * Phone number for session with pairing code
   */
  phoneNumber?: string;
}

export class WAutoMessageCompleteClass implements Partial<WAutoMessageComplete> {
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
   * @example "./my_media"
   */
  downloadMedia: (path: string) => Promise<string>;

  /**
   * Message sender Jid
   */
  from: string;

  /**
   * Message sender Jid
   */
  receiver: string;

  constructor(message: WAutoMessageComplete) {
    this.sessionId = message.sessionId;
    this.author = message.author;
    this.hasMedia = message.hasMedia;
    this.mediaType = message.mediaType;
    this.text = message.text;
    this.isStory = message.isStory;
    this.isGroup = message.isGroup;
    this.isReaction = message.isReaction;
    this.quotedMessage = message.quotedMessage;
    this.downloadMedia = message.downloadMedia;
    this.from = message.from;
    this.receiver = message.receiver;
  }
}

export interface IStickerOptions {
  filePath: string;
  pack?: string;
  author?: string;
  transparent?: boolean;
  bgColor?: string;
}
