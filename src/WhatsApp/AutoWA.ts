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
import { ValidationError, AutoWAError } from "../Error";
import {
  IWAutoMessageReceived,
  WAutoMessageUpdated,
  IWAutoSendMessage,
  IWAutoSendTyping,
  IWAutoSessionConfig,
  IWAutoMessage,
  IWAutoMessageSent,
  WAutoMessageComplete,
  IStickerOptions,
  GroupMemberUpdate,
  WAutoGroupMemberActionOptions,
  IWAutoSendMedia,
} from "../Types";
import {
  parseMessageStatusCodeToReadable,
  getMediaMimeType,
  phoneToJid,
  createDelay,
  isSessionExist,
} from "../Utils/helper";
import AutoWAEvent from "./AutoWAEvent";
import mime from "mime";
import Logger from "../Logger";
import { makeWebpBuffer } from "../Utils/make-stiker";
import { sessions } from ".";
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
  private pairingCode?: string;

  constructor(sessionId: string, options?: IWAutoSessionConfig) {
    if (isSessionExist(sessionId) && sessions.get(sessionId))
      throw new ValidationError(Messages.sessionAlreadyExist(sessionId));

    const defaultOptions: IWAutoSessionConfig = {
      printQR: true,
      logging: true,
    };

    this.sessionId = sessionId;
    this.options = { ...defaultOptions, ...options };
    this.callback = new Map();
    this.retryCount = 0;
    this.event = new AutoWAEvent(this.callback);
    this.logger = new Logger(sessionId, this);

    sessions.set(sessionId, this);

    this.logger.info("Created!");
  }

  public async setLogging(logging: boolean) {
    this.options.logging = logging;
  }

  public async initialize() {
    this.logger.info("Initializing...");
    await this.startWhatsApp(this.sessionId, this.options);
  }

  private async startWhatsApp(
    sessionId = "mySession",
    options: IWAutoSessionConfig = { printQR: true }
  ): Promise<WASocket> {
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
    try {
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
        browser: Browsers.baileys(this.sessionId),
      });

      return this.setupWASocket(saveCreds);
    } catch (error) {
      const msg = `Failed initiliaze WASocket: ${(error as AutoWAError).message}`;
      this.logger.error(msg);
      throw new AutoWAError(msg);
    }
  }

  private async setupWASocket(saveCreds: Function): Promise<WASocket> {
    try {
      if (
        typeof this.options.phoneNumber == "string" &&
        !this.options.printQR &&
        !this.pairingCode &&
        !this.sock.authState.creds.registered
      ) {
        try {
          this.pairingCode = await this.sock.requestPairingCode(this.options.phoneNumber);
          this.logger.info(`Pairing Code: ${this.pairingCode}`);
          this.callback.get(CALLBACK_KEY.ON_PAIRING_CODE)?.(this.pairingCode);

          this.retryCount = 0;
        } catch (error) {
          this.logger.warn("Retry connecting for Pairing Code...");
          await createDelay(5000);
          this.retryCount++;
          return await this.startSocket(this.sessionId, this.options);
        }
      }

      this.sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (this.options.printQR && qr) {
          this.logger.info("QR Updated!");
          this.callback.get(CALLBACK_KEY.ON_QR)?.(qr);
        }
        if (connection == "connecting") {
          this.logger.info("Connecting...");
          this.callback.get(CALLBACK_KEY.ON_CONNECTING)?.();
        }
        if (connection === "close" && !this.pairingCode) {
          const code = (lastDisconnect?.error as Boom)?.output?.statusCode;
          let shouldRetry = false;
          if (code != DisconnectReason.loggedOut && this.retryCount < 10) {
            shouldRetry = true;
          }
          if (shouldRetry) {
            this.logger.warn("Retry connecting...");
            this.retryCount++;
            return await this.startSocket(this.sessionId, this.options);
          } else {
            this.logger.warn("Disconnected!");
            this.retryCount = 0;
            this.callback.get(CALLBACK_KEY.ON_DISCONNECTED)?.();

            try {
              await this.destroy();
            } catch (error) {}

            return;
          }
        }
        if (connection == "open") {
          this.logger.info("Connected!");
          this.retryCount = 0;
          this.callback.get(CALLBACK_KEY.ON_CONNECTED)?.();
        }
      });

      this.sock.ev.on("creds.update", async () => {
        this.logger.info("Creds Updated!");
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
        if (new_message.type == "append") return;

        let msg = new_message.messages?.[0] as IWAutoMessage;
        if (msg.message?.documentWithCaptionMessage)
          msg = {
            ...msg,
            message: msg.message.documentWithCaptionMessage.message,
          } as IWAutoMessage;
        else if (msg.message?.ephemeralMessage)
          msg = {
            ...msg,
            message: msg.message.ephemeralMessage?.message,
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

        const setupMsgMedia = (msg: IWAutoMessage) => {
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

          msg.downloadMedia = (path) =>
            (async (path: string): Promise<string> => (path = ""))(path);
          if (msg.hasMedia)
            msg.downloadMedia = (path = "my_media") => this.downloadMedia(msg, path + "." + ext);
        };

        setupMsgMedia(msg);

        msg.quotedMessage && setupMsgMedia(msg.quotedMessage);

        const from = msg.key?.remoteJid || "";
        const participant = msg.key?.participant || "";
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

        msg.replyWithText = async (text: string, opts?: Partial<IWAutoSendMessage>) => {
          return await this.sendText({ ...opts, text, to: from, answering: msg });
        };
        msg.replyWithAudio = async (opts: IWAutoSendMedia) => {
          return await this.sendAudio({ ...opts, to: from, answering: msg });
        };
        msg.replyWithImage = async (opts: IWAutoSendMedia) => {
          return await this.sendImage({ ...opts, to: from, answering: msg });
        };
        msg.replyWithVideo = async (opts: IWAutoSendMedia) => {
          return await this.sendVideo({ ...opts, to: from, answering: msg });
        };
        msg.replyWithSticker = async (opts: Partial<IWAutoSendMedia & IStickerOptions>) => {
          return await this.sendSticker({ ...opts, to: from, answering: msg } as IWAutoSendMedia &
            IStickerOptions);
        };
        msg.replyWithTyping = async (duration) => {
          return await this.sendTyping({ to: from, duration });
        };
        msg.replyWithRecording = async (duration) => {
          return await this.sendRecording({ to: from, duration });
        };
        msg.read = async () => {
          return await this.readMessage([msg]);
        };
        msg.react = async (reaction: string) => {
          return await this.sendReaction({ to: from, answering: msg, text: reaction });
        };

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

      this.sock.ev.on("group-participants.update", async (data) => {
        const msg = {
          ...data,
          sessionId: this.sessionId,
        } as GroupMemberUpdate;

        msg.replyWithText = async (text: string, opts?: Partial<IWAutoSendMessage>) => {
          return await this.sendText({ ...opts, text, to: data.id });
        };
        msg.replyWithAudio = async (opts: IWAutoSendMedia) => {
          return await this.sendAudio({ ...opts, to: data.id });
        };
        msg.replyWithImage = async (opts: IWAutoSendMedia) => {
          return await this.sendImage({ ...opts, to: data.id });
        };
        msg.replyWithVideo = async (opts: IWAutoSendMedia) => {
          return await this.sendVideo({ ...opts, to: data.id });
        };
        msg.replyWithSticker = async (opts: Partial<IWAutoSendMedia & IStickerOptions>) => {
          return await this.sendSticker({ ...opts, to: data.id } as IWAutoSendMedia &
            IStickerOptions);
        };
        msg.replyWithTyping = async (duration) => {
          return await this.sendTyping({ to: data.id, duration });
        };
        msg.replyWithRecording = async (duration) => {
          return await this.sendRecording({ to: data.id, duration });
        };

        this.callback.get(CALLBACK_KEY.ON_GROUP_MEMBER_UPDATE)?.(msg);
      });

      return this.sock;
    } catch (error) {
      const msg = `Failed setup WASocket: ${(error as AutoWAError).message}`;
      this.logger.error(msg);
      throw new AutoWAError(msg);
    }
  }

  public async destroy() {
    this.logger.info("Destroying...");
    try {
      await this.sock.logout();
    } catch (error) {
      const msg = `Logout failed: ${(error as AutoWAError).message}`;
      this.logger.error(msg);
      throw new AutoWAError(msg);
    }
    this.sock.end(undefined);

    const dir = path.resolve(CREDENTIALS.DIR_NAME, this.sessionId + CREDENTIALS.PREFIX);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { force: true, recursive: true });
    }
    this.logger.info("Destroyed!");
  }

  public async isExist({ to, isGroup = false }: IWAutoSendMessage) {
    try {
      const receiver = phoneToJid({
        to,
        isGroup,
      });
      if (receiver.includes("@broadcast")) {
        return true;
      } else if (!receiver.includes("@g.us")) {
        return Boolean((await this.sock.onWhatsApp(receiver))?.[0]?.exists);
      } else {
        return Boolean((await this.sock.groupMetadata(receiver)).id);
      }
    } catch (error) {
      throw new AutoWAError(`Failed get exist status: ${(error as AutoWAError).message}`);
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
    if (msg) throw new AutoWAError(msg);

    return await this.sock.sendMessage(
      receiver,
      {
        text: text,
        mentions: props.mentions,
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
    if (!media) throw new AutoWAError("'media' parameter must be Buffer or String URL");

    const { receiver, msg } = await this.validateReceiver({
      to,
      isGroup,
    } as IWAutoSendMessage);
    if (msg) throw new AutoWAError(msg);

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
        mentions: props.mentions,
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
    if (!media) throw new AutoWAError("'media' parameter must be Buffer or String URL");

    const { receiver, msg } = await this.validateReceiver({
      to,
      isGroup,
    } as IWAutoSendMessage);
    if (msg) throw new AutoWAError(msg);

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
        mentions: props.mentions,
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
    if (!media) throw new AutoWAError("'media' parameter must be Buffer or String URL");

    const mimetype = mime.getType(filename);
    if (!mimetype) throw new AutoWAError(`Filename must include valid extension`);

    const { receiver, msg } = await this.validateReceiver({
      to,
      isGroup,
    } as IWAutoSendMessage);
    if (msg) throw new AutoWAError(msg);

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
        mentions: props.mentions,
      },
      {
        quoted: props.answering,
      }
    );
  }

  public async sendAudio({
    to,
    isGroup = false,
    media,
    voiceNote = false,
    ...props
  }: Omit<IWAutoSendMedia, "text">): Promise<proto.WebMessageInfo | undefined> {
    if (!media) throw new AutoWAError("'media' parameter must be Buffer or String URL");

    const { receiver, msg } = await this.validateReceiver({
      to,
      isGroup,
    } as IWAutoSendMessage);
    if (msg) throw new AutoWAError(msg);

    return await this.sock.sendMessage(
      receiver,
      {
        audio:
          typeof media == "string"
            ? {
                url: media,
              }
            : media,
        ptt: voiceNote,
        mentions: props.mentions,
      },
      {
        quoted: props.answering,
      }
    );
  }

  public async sendReaction({ to, text, isGroup = false, answering }: IWAutoSendMessage) {
    const { receiver, msg } = await this.validateReceiver({
      to,
      isGroup,
    } as IWAutoSendMessage);
    if (msg) throw new AutoWAError(msg);

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
    if (msg) throw new AutoWAError(msg);

    await this.sock.sendPresenceUpdate("composing", receiver);
    await createDelay(duration);
    await this.sock.sendPresenceUpdate("available", receiver);
  }

  public async sendRecording({ to, duration = 1000, isGroup = false }: IWAutoSendTyping) {
    const { receiver, msg } = await this.validateReceiver({
      to,
      isGroup,
    } as IWAutoSendMessage);
    if (msg) throw new AutoWAError(msg);

    await this.sock.sendPresenceUpdate("recording", receiver);
    await createDelay(duration);
    await this.sock.sendPresenceUpdate("available", receiver);
  }

  public async readMessage(msgs: IWAutoMessage[]) {
    await this.sock.readMessages(msgs.map((msg) => msg.key));
  }

  public async sendSticker({
    to,
    isGroup,
    filePath,
    pack = "WhatsAuto.js",
    author = "freack21",
    failMsg,
    ...props
  }: IWAutoSendMedia & IStickerOptions): Promise<proto.WebMessageInfo | undefined> {
    if (!filePath) throw new AutoWAError("'filePath' parameter must be String to file path");

    const { receiver, msg } = await this.validateReceiver({
      to,
      isGroup,
    } as IWAutoSendMessage);
    if (msg) throw new AutoWAError(msg);

    const buffer = await makeWebpBuffer({ filePath, pack, author, ...props });
    if (buffer === null) {
      return await this.sendText({
        to,
        text: failMsg || "The server failed to create a sticker🥹",
        isGroup,
        ...props,
      });
    }

    return await this.sock.sendMessage(
      receiver,
      {
        sticker: buffer,
        mentions: props.mentions,
      },
      {
        quoted: props.answering,
      }
    );
  }

  public async getProfileInfo(target: string) {
    const { receiver, msg } = await this.validateReceiver({
      to: target,
    } as IWAutoSendMessage);
    if (msg) throw new AutoWAError(msg);

    const [profilePictureUrl, status] = await Promise.allSettled([
      this.sock.profilePictureUrl(receiver, "image", 5000),
      this.sock.fetchStatus(receiver),
    ]);
    return {
      profilePictureUrl:
        profilePictureUrl.status === "fulfilled" ? profilePictureUrl.value || null : null,
      status: status.status === "fulfilled" ? status.value || null : null,
    };
  }

  public async addMemberToGroup({ participants, to }: WAutoGroupMemberActionOptions) {
    const { receiver: group, msg } = await this.validateReceiver({
      to,
      isGroup: true,
    } as IWAutoSendMessage);
    if (msg) throw new AutoWAError(msg);
    participants = participants.map((d) => phoneToJid({ to: d }));

    return await this.sock.groupParticipantsUpdate(group, participants, "add");
  }

  public async removeMemberFromGroup({ participants, to }: WAutoGroupMemberActionOptions) {
    const { receiver: group, msg } = await this.validateReceiver({
      to,
      isGroup: true,
    } as IWAutoSendMessage);
    if (msg) throw new AutoWAError(msg);
    participants = participants.map((d) => phoneToJid({ to: d }));

    return await this.sock.groupParticipantsUpdate(group, participants, "remove");
  }

  public async promoteMemberGroup({ participants, to }: WAutoGroupMemberActionOptions) {
    const { receiver: group, msg } = await this.validateReceiver({
      to,
      isGroup: true,
    } as IWAutoSendMessage);
    if (msg) throw new AutoWAError(msg);
    participants = participants.map((d) => phoneToJid({ to: d }));

    return await this.sock.groupParticipantsUpdate(group, participants, "promote");
  }

  public async demoteMemberGroup({ participants, to }: WAutoGroupMemberActionOptions) {
    const { receiver: group, msg } = await this.validateReceiver({
      to,
      isGroup: true,
    } as IWAutoSendMessage);
    if (msg) throw new AutoWAError(msg);
    participants = participants.map((d) => phoneToJid({ to: d }));

    return await this.sock.groupParticipantsUpdate(group, participants, "demote");
  }
}
