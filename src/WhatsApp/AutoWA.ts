import path from "path";
import fs from "fs";
import { Boom } from "@hapi/boom";
import makeWASocket, {
  WASocket,
  DisconnectReason,
  downloadMediaMessage,
  Browsers,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  proto,
  WAMessage,
} from "@whiskeysockets/baileys";
import { CALLBACK_KEY, CREDENTIALS, Messages } from "../Defaults";
import { ValidationError, WhatsAppError } from "../Error";
import {
  IWAutoMessageReceived,
  WAutoMessageUpdated,
  IWAutoSendMedia,
  IWAutoSendMessage,
  IWAutoSendRead,
  IWAutoSendTyping,
  IWAutoSessionConfig,
  IWAutoMessage,
  IWAutoMessageSent,
  WAutoMessageComplete,
  IStickerOptions,
} from "../Types";
import {
  parseMessageStatusCodeToReadable,
  getMediaMimeType,
  phoneToJid,
  createDelay,
} from "../Utils";
import AutoWAEvent from "./AutoWAEvent";
import { AutoWAManager } from "./AutoWAManager";
import mime from "mime";
// import Sticker, { IStickerOptions, StickerTypes } from "wa-sticker-formatter";
import Logger from "../Logger";
import { makeWebpBuffer } from "../Utils/make-stiker";
const P = require("pino")({
  level: "fatal",
});

export class AutoWA {
  private logger: Logger;
  private callback: Map<string, Function>;
  private retryCount: number;
  public sock: WASocket;
  public sessionId: string;
  public options: IWAutoSessionConfig;
  public event: AutoWAEvent;

  private myManager?: AutoWAManager;

  constructor(
    sessionId: string,
    options: IWAutoSessionConfig = { printQR: true },
    manager?: AutoWAManager
  ) {
    this.sessionId = sessionId;
    this.options = options;
    this.myManager = manager;
    this.callback = new Map();
    this.retryCount = 0;
    this.event = new AutoWAEvent(this.callback);
    this.logger = new Logger("AutoWA");
  }

  public async initialize() {
    await this.startWhatsApp(this.sessionId, this.options);
  }

  private async startWhatsApp(
    sessionId = "mySession",
    options: IWAutoSessionConfig = { printQR: true }
  ): Promise<WASocket> {
    if (this.myManager instanceof AutoWAManager && this.myManager.isSessionExist(sessionId))
      throw new ValidationError(Messages.sessionAlreadyExist(sessionId));

    if (typeof options.phoneNumber == "string") {
      if (options.phoneNumber === "")
        throw new ValidationError(Messages.paremetersNotValid("phoneNumber"));

      options.printQR = false;
      options.phoneNumber = phoneToJid({
        to: options.phoneNumber,
      });
    }

    return this.startSocket(sessionId, options);
  }

  private async startSocket(sessionId: string, options: IWAutoSessionConfig) {
    const { version } = await fetchLatestBaileysVersion();

    const { state, saveCreds } = await useMultiFileAuthState(
      path.resolve(CREDENTIALS.DIR_NAME, sessionId + CREDENTIALS.PREFIX)
    );

    this.sock = makeWASocket({
      version,
      printQRInTerminal: options.printQR,
      auth: state,
      logger: P,
      markOnlineOnConnect: false,
      browser: Browsers.windows("Desktop"),
    });

    return this.setupWASocket(saveCreds);
  }

  private async setupWASocket(saveCreds: Function): Promise<WASocket> {
    try {
      if (
        typeof this.options.phoneNumber == "string" &&
        !this.options.printQR &&
        !this.sock.authState.creds.registered
      ) {
        let code: string = "";

        try {
          code = await this.sock.requestPairingCode(this.options.phoneNumber);
        } catch (error) {
          this.logger.error(`Request Pair Code: ${error}`);
          let shouldRetry = false;
          if (this.retryCount < 10) {
            shouldRetry = true;
          }
          if (shouldRetry) {
            this.retryCount++;
            return this.startSocket(this.sessionId, this.options);
          } else {
            this.retryCount = 0;
            this.myManager?.deleteSession(this.sessionId);
            this.callback.get(CALLBACK_KEY.ON_DISCONNECTED)?.();
            return;
          }
        }

        this.callback.get(CALLBACK_KEY.ON_PAIRING_CODE)?.(code);
      }

      this.sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (this.options.printQR && qr) {
          this.callback.get(CALLBACK_KEY.ON_QR)?.(qr);
        }
        if (connection == "connecting") {
          this.callback.get(CALLBACK_KEY.ON_CONNECTING)?.();
        }
        if (connection === "close") {
          const code = (lastDisconnect?.error as Boom)?.output?.statusCode;
          let shouldRetry = false;
          if (code != DisconnectReason.loggedOut && this.retryCount < 10) {
            shouldRetry = true;
          }
          if (shouldRetry) {
            this.retryCount++;
            return this.startSocket(this.sessionId, this.options);
          } else {
            this.retryCount = 0;
            this.myManager?.deleteSession(this.sessionId);
            this.callback.get(CALLBACK_KEY.ON_DISCONNECTED)?.();
            return;
          }
        }
        if (connection == "open") {
          this.retryCount = 0;
          this.callback.get(CALLBACK_KEY.ON_CONNECTED)?.();
        }
      });

      this.sock.ev.on("creds.update", async () => {
        await saveCreds();
      });

      this.sock.ev.on("messages.update", async (message) => {
        const msg = message[0];

        const data: WAutoMessageUpdated = {
          sessionId: this.sessionId,
          messageStatus: parseMessageStatusCodeToReadable(msg.update.status!),
          ...msg,
        };
        this.callback.get(CALLBACK_KEY.ON_MESSAGE_UPDATED)?.(data);
      });

      this.sock.ev.on("messages.upsert", async (new_message) => {
        let msg = new_message.messages?.[0] as IWAutoMessage;
        if (msg.message?.documentWithCaptionMessage)
          msg = {
            ...msg,
            message: msg.message.documentWithCaptionMessage.message,
          } as IWAutoMessage;

        msg.sessionId = this.sessionId;

        let quotedMessage: IWAutoMessage | null = null;
        const msgContextInfo =
          msg.message?.extendedTextMessage?.contextInfo ||
          msg.message?.imageMessage?.contextInfo ||
          msg.message?.videoMessage?.contextInfo ||
          msg.message?.stickerMessage?.contextInfo ||
          msg.message?.documentMessage?.contextInfo;
        if (msgContextInfo?.quotedMessage) {
          quotedMessage = {
            key: {
              remoteJid: msgContextInfo?.participant,
              id: msgContextInfo?.stanzaId,
            },
            message: msgContextInfo?.quotedMessage,
          } as IWAutoMessage;
        }
        if (quotedMessage?.message?.documentWithCaptionMessage) {
          quotedMessage = {
            ...quotedMessage,
            message: quotedMessage.message.documentWithCaptionMessage.message,
          };
        }
        msg.quotedMessage = quotedMessage;

        const text =
          msg.message?.conversation ||
          msg.message?.extendedTextMessage?.text ||
          msg.message?.imageMessage?.caption ||
          msg.message?.videoMessage?.caption ||
          msg.message?.documentMessage?.caption ||
          "";
        msg.text = text;

        const mediaTypes = ["image", "audio", "video", "document"];
        const mimeType = getMediaMimeType(msg);
        const ext = mime.getExtension(mimeType);
        msg.hasMedia = mimeType !== "";
        msg.mediaType = "";
        if (mimeType)
          msg.mediaType =
            mediaTypes[
              mediaTypes.indexOf(mimeType.split("/")[0]) !== -1
                ? mediaTypes.indexOf(mimeType.split("/")[0])
                : 3
            ];

        msg.downloadMedia = (path) => (async (path: string): Promise<string> => (path = ""))(path);
        if (msg.hasMedia)
          msg.downloadMedia = (path = "my_media") => this.downloadMedia(msg, path + "." + ext);

        if (msg.quotedMessage) {
          const mimeType = getMediaMimeType(msg.quotedMessage);
          const ext = mime.getExtension(mimeType);
          msg.quotedMessage.hasMedia = mimeType !== "";
          msg.quotedMessage.mediaType = "";
          if (mimeType)
            msg.quotedMessage.mediaType =
              mediaTypes[
                mediaTypes.indexOf(mimeType.split("/")[0]) !== -1
                  ? mediaTypes.indexOf(mimeType.split("/")[0])
                  : 3
              ];

          msg.quotedMessage.downloadMedia = (path) =>
            (async (path: string): Promise<string> => (path = ""))(path);
          if (msg.quotedMessage.hasMedia)
            msg.quotedMessage.downloadMedia = (path = "my_media") =>
              this.downloadMedia(msg.quotedMessage, path + "." + ext);
        }

        const from = msg.key.remoteJid || "";
        const participant = msg.key.participant || "";
        const isGroup = from.includes("@g.us");
        const isStory = from.includes("status@broadcast");
        const isReaction = msg.message?.reactionMessage ? true : false;
        const myJid = phoneToJid({ to: this.sock.user.id.split(":")[0] });

        msg.isGroup = isGroup;
        msg.isStory = isStory;
        msg.isReaction = isReaction;
        msg.author = from;
        if (isStory || isGroup) msg.author = participant;

        if (isReaction) msg.text = msg.message?.reactionMessage?.text;

        if (msg.key.fromMe) {
          msg = {
            ...msg,
            receiver: from,
            author: myJid,
          } as IWAutoMessageSent;

          this.callback.get(CALLBACK_KEY.ON_MESSAGE_SENT)?.(msg);

          if (isStory) {
            this.callback.get(CALLBACK_KEY.ON_STORY_SENT)?.(msg);
          } else if (isReaction) {
            this.callback.get(CALLBACK_KEY.ON_REACTION_SENT)?.(msg);
            if (isGroup) this.callback.get(CALLBACK_KEY.ON_GROUP_REACTION_SENT)?.(msg);
            else this.callback.get(CALLBACK_KEY.ON_PRIVATE_REACTION_SENT)?.(msg);
          } else if (isGroup) {
            this.callback.get(CALLBACK_KEY.ON_GROUP_MESSAGE_SENT)?.(msg);
          } else {
            this.callback.get(CALLBACK_KEY.ON_PRIVATE_MESSAGE_SENT)?.(msg);
          }
        } else {
          msg = {
            ...msg,
            from,
          } as IWAutoMessageReceived;
          if (isStory) (msg as IWAutoMessageReceived).from = participant;

          this.callback.get(CALLBACK_KEY.ON_MESSAGE_RECEIVED)?.(msg);

          if (isStory) {
            this.callback.get(CALLBACK_KEY.ON_STORY_RECEIVED)?.(msg);
          } else if (isReaction) {
            this.callback.get(CALLBACK_KEY.ON_REACTION_RECEIVED)?.(msg);
            if (isGroup) this.callback.get(CALLBACK_KEY.ON_GROUP_REACTION_RECEIVED)?.(msg);
            else this.callback.get(CALLBACK_KEY.ON_PRIVATE_REACTION_RECEIVED)?.(msg);
          } else if (isGroup) {
            this.callback.get(CALLBACK_KEY.ON_GROUP_MESSAGE_RECEIVED)?.(msg);
          } else {
            this.callback.get(CALLBACK_KEY.ON_PRIVATE_MESSAGE_RECEIVED)?.(msg);
          }
        }

        msg = { ...msg } as WAutoMessageComplete;
        if (msg.key?.fromMe) {
          msg = { ...msg, from: msg.key.remoteJid } as WAutoMessageComplete;
        } else {
          msg = { ...msg, receiver: msg.key.remoteJid } as WAutoMessageComplete;
        }

        if (isStory) {
          this.callback.get(CALLBACK_KEY.ON_STORY)?.(msg);
        } else if (isReaction) {
          this.callback.get(CALLBACK_KEY.ON_REACTION)?.(msg);
          if (isGroup) this.callback.get(CALLBACK_KEY.ON_GROUP_REACTION)?.(msg);
          else this.callback.get(CALLBACK_KEY.ON_PRIVATE_REACTION)?.(msg);
        } else if (isGroup) {
          this.callback.get(CALLBACK_KEY.ON_GROUP_MESSAGE)?.(msg);
        } else {
          this.callback.get(CALLBACK_KEY.ON_PRIVATE_MESSAGE)?.(msg);
        }

        this.callback.get(CALLBACK_KEY.ON_MESSAGE)?.(msg);
      });

      return this.sock;
    } catch (error) {
      throw error as WhatsAppError;
    }
  }

  public async logout() {
    return await this.sock.logout();
  }

  public end() {
    return this.sock.end(undefined);
  }

  public async isExist({ to, isGroup = false }: IWAutoSendMessage) {
    try {
      const receiver = phoneToJid({
        to: to,
        isGroup: isGroup,
      });
      if (!isGroup) {
        const one = Boolean((await this.sock.onWhatsApp(receiver))?.[0]?.exists);
        return one;
      } else {
        return Boolean((await this.sock.groupMetadata(receiver)).id);
      }
    } catch (error) {
      throw error;
    }
  }

  private async downloadMedia(msg: WAMessage, mediaPath: string) {
    const filePath = path.join(process.cwd(), mediaPath);
    const buf = await downloadMediaMessage(msg, "buffer", {});
    fs.writeFileSync(filePath, (buf as Buffer).toString("base64"), "base64");
    return Promise.resolve(filePath);
  }

  private async validateReceiver({ to, isGroup = false }: IWAutoSendMessage): Promise<{
    receiver?: string | undefined;
    msg?: string | undefined;
  }> {
    const oldPhone = to;
    to = phoneToJid({ to, isGroup });

    const isRegistered = await this.isExist({
      to,
      isGroup,
    } as IWAutoSendMessage);
    if (!isRegistered) {
      return {
        msg: `${oldPhone} is not registered on Whatsapp`,
      };
    }
    return {
      receiver: to,
    };
  }

  public async sendText({
    to,
    text = "",
    isGroup = false,
    ...props
  }: IWAutoSendMessage): Promise<proto.WebMessageInfo | undefined> {
    const { receiver, msg } = await this.validateReceiver({
      to,
      isGroup,
    } as IWAutoSendMessage);
    if (msg) throw new WhatsAppError(msg);

    return await this.sock.sendMessage(
      receiver,
      {
        text: text,
      },
      {
        quoted: props.answering,
      }
    );
  }

  public async sendImage({
    to,
    text = "",
    isGroup = false,
    media,
    ...props
  }: IWAutoSendMedia): Promise<proto.WebMessageInfo | undefined> {
    if (!media) throw new WhatsAppError("parameter media must be Buffer or String URL");

    const { receiver, msg } = await this.validateReceiver({
      to,
      isGroup,
    } as IWAutoSendMessage);
    if (msg) throw new WhatsAppError(msg);

    return await this.sock.sendMessage(
      receiver,
      {
        image:
          typeof media == "string"
            ? {
                url: media,
              }
            : media,
        caption: text,
      },
      {
        quoted: props.answering,
      }
    );
  }

  public async sendVideo({
    to,
    text = "",
    isGroup = false,
    media,
    ...props
  }: IWAutoSendMedia): Promise<proto.WebMessageInfo | undefined> {
    if (!media) throw new WhatsAppError("parameter media must be Buffer or String URL");

    const { receiver, msg } = await this.validateReceiver({
      to,
      isGroup,
    } as IWAutoSendMessage);
    if (msg) throw new WhatsAppError(msg);

    return await this.sock.sendMessage(
      receiver,
      {
        video:
          typeof media == "string"
            ? {
                url: media,
              }
            : media,
        caption: text,
      },
      {
        quoted: props.answering,
      }
    );
  }

  public async sendDocument({
    to,
    text = "",
    isGroup = false,
    media,
    filename,
    ...props
  }: IWAutoSendMedia & {
    filename: string;
  }): Promise<proto.WebMessageInfo | undefined> {
    if (!media) throw new WhatsAppError("parameter media must be Buffer or String URL");

    const mimetype = mime.getType(filename);
    if (!mimetype) throw new WhatsAppError(`Filename must include valid extension`);

    const { receiver, msg } = await this.validateReceiver({
      to,
      isGroup,
    } as IWAutoSendMessage);
    if (msg) throw new WhatsAppError(msg);

    return await this.sock.sendMessage(
      receiver,
      {
        fileName: filename,
        document:
          typeof media == "string"
            ? {
                url: media,
              }
            : media,
        mimetype: mimetype,
        caption: text,
      },
      {
        quoted: props.answering,
      }
    );
  }

  public async sendVoiceNote({
    to,
    isGroup = false,
    media,
    ...props
  }: Omit<IWAutoSendMedia, "text">): Promise<proto.WebMessageInfo | undefined> {
    if (!media) throw new WhatsAppError("parameter media must be Buffer or String URL");

    const { receiver, msg } = await this.validateReceiver({
      to,
      isGroup,
    } as IWAutoSendMessage);
    if (msg) throw new WhatsAppError(msg);

    return await this.sock.sendMessage(
      receiver,
      {
        audio:
          typeof media == "string"
            ? {
                url: media,
              }
            : media,
        ptt: true,
      },
      {
        quoted: props.answering,
      }
    );
  }

  public async sendReaction({ to, text, isGroup = false, answering }: IWAutoSendTyping) {
    const { receiver, msg } = await this.validateReceiver({
      to,
      isGroup,
    } as IWAutoSendMessage);
    if (msg) throw new WhatsAppError(msg);

    return await this.sock.sendMessage(receiver, {
      react: {
        text,
        key: answering.key,
      },
    });
  }

  public async sendTyping({ to, duration = 1000, isGroup = false }: IWAutoSendTyping) {
    const { receiver, msg } = await this.validateReceiver({
      to,
      isGroup,
    } as IWAutoSendMessage);
    if (msg) throw new WhatsAppError(msg);

    await this.sock.sendPresenceUpdate("composing", receiver);
    await createDelay(duration);
    await this.sock.sendPresenceUpdate("available", receiver);
  }

  public async sendRecording({ to, duration = 1000, isGroup = false }: IWAutoSendTyping) {
    const { receiver, msg } = await this.validateReceiver({
      to,
      isGroup,
    } as IWAutoSendMessage);
    if (msg) throw new WhatsAppError(msg);

    await this.sock.sendPresenceUpdate("recording", receiver);
    await createDelay(duration);
    await this.sock.sendPresenceUpdate("available", receiver);
  }

  public async readMessage({ key }: IWAutoSendRead) {
    await this.sock.readMessages([key]);
  }

  public async sendSticker({
    to,
    isGroup,
    filePath,
    pack = "WhatsAuto.js",
    author = "freack21",
    ...props
  }: IWAutoSendMedia & IStickerOptions): Promise<proto.WebMessageInfo | undefined> {
    if (!filePath) throw new WhatsAppError("parameter filePath must be String to file path");

    const { receiver, msg } = await this.validateReceiver({
      to,
      isGroup,
    } as IWAutoSendMessage);
    if (msg) throw new WhatsAppError(msg);

    return await this.sock.sendMessage(
      receiver,
      {
        sticker: await makeWebpBuffer({ filePath, pack, author, ...props }),
      },
      {
        quoted: props.answering,
      }
    );
  }
}
