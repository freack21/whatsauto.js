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
  WAMessage,
} from "@whiskeysockets/baileys";
import { CALLBACK_KEY, CREDENTIALS, Messages } from "../Defaults";
import { ValidationError, AutoWAError } from "../Error";
import {
  WAutoMessageUpdated,
  IWAutoSendMessage,
  IWAutoSendTyping,
  IWAutoSessionConfig,
  IWAutoMessage,
  GroupMemberUpdate,
  WAutoGroupMemberActionOptions,
  IWAutoSendMedia,
  IWAutoPhoneToJid,
  IWAutoDownloadMedia,
  IWAutoForwardMessage,
  IWAutoSendSticker,
  IStickerOptions,
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
const qrcode = require("qrcode-terminal");

export class AutoWA {
  private logger: Logger;
  private callback: Map<string, Function>;
  private retryCount: number;
  public sock: WASocket;
  public sessionId: string;
  public options: IWAutoSessionConfig;
  public event: AutoWAEvent;
  private pairingCode?: string;
  defaultStickerProps: IStickerOptions = {
    pack: "whatsauto.js",
    author: "freack21",
    media: null,
  };

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
        from: options.phoneNumber,
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
          this.pairingCode = await this.sock.requestPairingCode(
            phoneToJid({ from: this.options.phoneNumber, reverse: true })
          );
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
          if (this.options.printQR) {
            qrcode.generate(qr, { small: true });
          }
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
              await this.destroy(true);
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
        const myJid = phoneToJid({ from: this.sock.user.id });

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
              remoteJid: msg.key?.remoteJid,
              id: msgContextInfo?.stanzaId,
              participant: msgContextInfo?.participant,
              fromMe: msgContextInfo?.participant == myJid,
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

        const mediaTypes = ["image", "audio", "video", "document"];

        const setupMsg = (msg: IWAutoMessage, parent?: IWAutoMessage) => {
          const text =
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            msg.message?.imageMessage?.caption ||
            msg.message?.videoMessage?.caption ||
            msg.message?.documentMessage?.caption ||
            "";
          msg.text = text;

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

          msg.downloadMedia = async () => Promise.resolve("");
          msg.toSticker = async () => Promise.resolve([null, false]);
          if (msg.hasMedia) {
            msg.downloadMedia = async (opts = {}) => this.downloadMedia(msg, opts, ext);
          }

          if (msg.hasMedia || msg.quotedMessage?.hasMedia) {
            msg.toSticker = async (props?: Omit<IStickerOptions, "media">) => {
              let mediaBuf: string | Buffer;
              if (msg.hasMedia && ["image", "video"].includes(msg.mediaType)) {
                mediaBuf = await msg.downloadMedia({ asBuffer: true });
              } else if (
                msg.quotedMessage &&
                msg.quotedMessage.hasMedia &&
                ["image", "video"].includes(msg.quotedMessage.mediaType)
              ) {
                mediaBuf = await msg.quotedMessage.downloadMedia({ asBuffer: true });
              }

              if (!mediaBuf) return [null, false];

              const stickerProps = {
                ...this.defaultStickerProps,
                ...props,
                media: mediaBuf,
              } as IStickerOptions & {
                media?: Buffer;
              };

              const buffer = await makeWebpBuffer(stickerProps);

              return [buffer, true];
            };
          }

          const from = msg.key?.remoteJid || "";
          const participant = msg.key?.participant || "";
          const isGroup = from.includes("@g.us");
          const isStory = from.includes("status@broadcast");
          const isReaction = msg.message?.reactionMessage ? true : false;

          // if (!parent)
          if (msg.key?.fromMe) {
            msg.from = from;
            msg.receiver = from;
            msg.author = myJid;
          } else {
            msg.from = from;
            msg.receiver = myJid;
            msg.author = from;

            if (isGroup || isStory) msg.author = participant;
            if (isGroup) msg.receiver = from;
          }

          msg.isGroup = isGroup;
          msg.isStory = isStory;
          msg.isReaction = isReaction;

          if (isReaction) msg.text = msg.message?.reactionMessage?.text;

          msg.replyWithText = async (text, opts) => {
            return await this.sendText({ ...opts, text, to: from, answering: msg });
          };
          msg.replyWithAudio = async (media, opts) => {
            return await this.sendAudio({ media, ...opts, to: from, answering: msg });
          };
          msg.replyWithImage = async (media, opts) => {
            return await this.sendImage({ media, ...opts, to: from, answering: msg });
          };
          msg.replyWithVideo = async (media, opts) => {
            return await this.sendVideo({ media, ...opts, to: from, answering: msg });
          };
          msg.replyWithSticker = async (sticker, opts) => {
            return await this.sendSticker({
              sticker,
              ...opts,
              to: from,
              answering: msg,
            } as IWAutoSendSticker & IStickerOptions);
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
          msg.react = async (reaction) => {
            return await this.sendReaction({ to: from, answering: msg, text: reaction });
          };
          msg.forward = async (to, opts) => {
            return await this.forwardMessage({ to, msg, ...opts });
          };
        };

        msg.quotedMessage && setupMsg(msg.quotedMessage, msg);

        setupMsg(msg);

        const { isStory, isReaction, isGroup } = msg;

        if (msg.key.fromMe) {
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

        msg.replyWithText = async (text: string, opts) => {
          return await this.sendText({ ...opts, text, to: data.id });
        };
        msg.replyWithAudio = async (media, opts) => {
          return await this.sendAudio({ media, ...opts, to: data.id });
        };
        msg.replyWithImage = async (media, opts) => {
          return await this.sendImage({ media, ...opts, to: data.id });
        };
        msg.replyWithVideo = async (media, opts) => {
          return await this.sendVideo({ media, ...opts, to: data.id });
        };
        msg.replyWithSticker = async (sticker, opts) => {
          return await this.sendSticker({ sticker, ...opts, to: data.id } as IWAutoSendSticker &
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

  public async destroy(full?: boolean) {
    this.logger.info("Destroying...");
    let error = false;
    let msg = "";
    try {
      await this.sock.logout();
    } catch (err) {
      msg = `Logout failed: ${(err as AutoWAError).message}`;
      error = true;
    } finally {
      this.sock.end(undefined);

      if (full) {
        const dir = path.resolve(CREDENTIALS.DIR_NAME, this.sessionId + CREDENTIALS.PREFIX);
        if (fs.existsSync(dir)) {
          fs.rmSync(dir, { force: true, recursive: true });
        }
      }

      this.logger.info("Destroyed!");
    }

    if (error) {
      this.logger.error(msg);
      throw new AutoWAError(msg);
    }
  }

  public async isExist({ from, isGroup = false }: IWAutoPhoneToJid) {
    try {
      const receiver = phoneToJid({
        from: from,
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
      const msg = `Failed get exist status: ${(error as AutoWAError).message}`;
      this.logger.error(msg);
      throw new AutoWAError(msg);
    }
  }

  private async downloadMedia(msg: WAMessage, opts: IWAutoDownloadMedia, ext: string) {
    const filePath = path.join(process.cwd(), (opts.path || "my_media") + "." + ext);
    const buf = await downloadMediaMessage(msg, "buffer", {});

    if (opts.asBuffer) return Promise.resolve(buf);

    fs.writeFileSync(filePath, buf);
    return Promise.resolve(filePath);
  }

  private async validateReceiver({ from, isGroup = false }: IWAutoPhoneToJid): Promise<{
    receiver?: string | undefined;
    msg?: string | undefined;
  }> {
    const oldPhone = from;
    from = phoneToJid({ from, isGroup });

    const isRegistered = await this.isExist({
      from,
      isGroup,
    } as IWAutoPhoneToJid);
    if (!isRegistered) {
      return {
        msg: `${oldPhone} is not registered on Whatsapp`,
      };
    }
    return {
      receiver: from,
    };
  }

  public async sendText({ to, text = "", isGroup = false, ...props }: IWAutoSendMessage) {
    const { receiver, msg } = await this.validateReceiver({
      from: to,
      isGroup,
    } as IWAutoPhoneToJid);
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
    failMsg,
    ...props
  }: IWAutoSendMedia) {
    if (!media) throw new AutoWAError("'media' parameter must be Buffer or String URL");

    const { receiver, msg } = await this.validateReceiver({
      from: to,
      isGroup,
    } as IWAutoPhoneToJid);
    if (msg) throw new AutoWAError(msg);

    try {
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
    } catch (error) {
      this.logger.error("Failed send media:" + (error as AutoWAError).message);
      return await this.sendText({
        to: receiver,
        text: failMsg || "There is error while trying to send the image🥹",
        ...props,
      });
    }
  }

  public async sendVideo({
    to,
    text = "",
    isGroup = false,
    media,
    failMsg,
    ...props
  }: IWAutoSendMedia) {
    if (!media) throw new AutoWAError("'media' parameter must be Buffer or String URL");

    const { receiver, msg } = await this.validateReceiver({
      from: to,
      isGroup,
    } as IWAutoPhoneToJid);
    if (msg) throw new AutoWAError(msg);

    try {
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
    } catch (error) {
      this.logger.error("Failed send media:" + (error as AutoWAError).message);
      return await this.sendText({
        to: receiver,
        text: failMsg || "There is error while trying to send the video🥹",
        ...props,
      });
    }
  }

  public async sendDocument({
    to,
    text = "",
    isGroup = false,
    media,
    filename,
    failMsg,
    ...props
  }: IWAutoSendMedia & {
    filename: string;
  }) {
    if (!media) throw new AutoWAError("'media' parameter must be Buffer or String URL");

    const mimetype = mime.getType(filename);
    if (!mimetype) throw new AutoWAError(`Filename must include valid extension`);

    const { receiver, msg } = await this.validateReceiver({
      from: to,
      isGroup,
    } as IWAutoPhoneToJid);
    if (msg) throw new AutoWAError(msg);

    try {
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
    } catch (error) {
      this.logger.error("Failed send media:" + (error as AutoWAError).message);
      return await this.sendText({
        to: receiver,
        text: failMsg || "There is error while trying to send the document",
        ...props,
      });
    }
  }

  public async sendAudio({
    to,
    isGroup = false,
    media,
    voiceNote = false,
    failMsg,
    ...props
  }: Omit<IWAutoSendMedia, "text">) {
    if (!media) throw new AutoWAError("'media' parameter must be Buffer or String URL");

    const { receiver, msg } = await this.validateReceiver({
      from: to,
      isGroup,
    } as IWAutoPhoneToJid);
    if (msg) throw new AutoWAError(msg);

    try {
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
    } catch (error) {
      this.logger.error("Failed send media:" + (error as AutoWAError).message);
      return await this.sendText({
        to: receiver,
        text: failMsg || "There is error while trying to send the audio🥹",
        ...props,
      });
    }
  }

  public async sendReaction({ to, text, isGroup = false, answering }: IWAutoSendMessage) {
    const { receiver, msg } = await this.validateReceiver({
      from: to,
      isGroup,
    } as IWAutoPhoneToJid);
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
      from: to,
      isGroup,
    } as IWAutoPhoneToJid);
    if (msg) throw new AutoWAError(msg);

    await this.sock.sendPresenceUpdate("composing", receiver);
    await createDelay(duration);
    await this.sock.sendPresenceUpdate("available", receiver);
  }

  public async sendRecording({ to, duration = 1000, isGroup = false }: IWAutoSendTyping) {
    const { receiver, msg } = await this.validateReceiver({
      from: to,
      isGroup,
    } as IWAutoPhoneToJid);
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
    sticker,
    media,
    failMsg,
    hasMedia,
    ...props
  }: IWAutoSendSticker & IStickerOptions) {
    const { receiver, msg } = await this.validateReceiver({
      from: to,
      isGroup,
    } as IWAutoPhoneToJid);
    if (msg) throw new AutoWAError(msg);
    if (!media && !sticker && !hasMedia)
      throw new AutoWAError("'media' or 'sticker' parameter must be filled");

    if (!sticker) {
      if (!(typeof media === "string" || Buffer.isBuffer(media)) && !hasMedia) {
        throw new AutoWAError("'media' parameter must be string or buffer");
      }

      const stickerProps = {
        ...this.defaultStickerProps,
        media,
        ...props,
      } as IStickerOptions;

      sticker = await makeWebpBuffer(stickerProps);
    }

    if (!sticker || !Buffer.isBuffer(sticker)) {
      return await this.sendText({
        to,
        text: failMsg || "There is error while creating the sticker🥹",
        isGroup,
        ...props,
      });
    }

    try {
      return await this.sock.sendMessage(
        receiver,
        {
          sticker,
          mentions: props.mentions,
        },
        {
          quoted: props.answering,
        }
      );
    } catch (error) {
      this.logger.error("Failed send media:" + (error as AutoWAError).message);
      return await this.sendText({
        to: receiver,
        text: failMsg || "There is error while trying to send the sticker🥹",
        ...props,
      });
    }
  }

  public async forwardMessage({ to, msg, isGroup = false, ...props }: IWAutoForwardMessage) {
    const { receiver, msg: err_msg } = await this.validateReceiver({
      from: to,
      isGroup,
    } as IWAutoPhoneToJid);
    if (err_msg) throw new AutoWAError(err_msg);

    try {
      return await this.sock.sendMessage(receiver, {
        forward: msg,
        mentions: props.mentions,
        force: true,
      });
    } catch (error) {
      this.logger.error("Failed forward a message!");
    }
  }

  public async getProfileInfo(target: string) {
    const { receiver, msg } = await this.validateReceiver({
      from: target,
    } as IWAutoPhoneToJid);
    if (msg) throw new AutoWAError(msg);

    try {
      const [profilePictureUrl, status] = await Promise.allSettled([
        this.sock.profilePictureUrl(receiver, "image", 5000),
        this.sock.fetchStatus(receiver),
      ]);
      return {
        profilePictureUrl:
          profilePictureUrl.status === "fulfilled" ? profilePictureUrl.value || null : null,
        status: status.status === "fulfilled" ? status.value || null : null,
      };
    } catch (error) {
      const msg = `Failed get profile info: ${(error as AutoWAError).message}`;
      this.logger.error(msg);
    }
    return null;
  }

  public async getGroupInfo(target: string) {
    const { receiver, msg } = await this.validateReceiver({
      from: target,
      isGroup: true,
    } as IWAutoPhoneToJid);
    if (msg) throw new AutoWAError(msg);

    try {
      return await this.sock.groupMetadata(receiver);
    } catch (error) {
      const msg = `Failed get group info: ${(error as AutoWAError).message}`;
      this.logger.error(msg);
    }
    return null;
  }

  public async addMemberToGroup({ participants, to }: WAutoGroupMemberActionOptions) {
    const { receiver: group, msg } = await this.validateReceiver({
      from: to,
      isGroup: true,
    } as IWAutoPhoneToJid);
    if (msg) throw new AutoWAError(msg);
    participants = participants.map((d) => phoneToJid({ from: d }));

    return await this.sock.groupParticipantsUpdate(group, participants, "add");
  }

  public async removeMemberFromGroup({ participants, to }: WAutoGroupMemberActionOptions) {
    const { receiver: group, msg } = await this.validateReceiver({
      from: to,
      isGroup: true,
    } as IWAutoPhoneToJid);
    if (msg) throw new AutoWAError(msg);
    participants = participants.map((d) => phoneToJid({ from: d }));

    return await this.sock.groupParticipantsUpdate(group, participants, "remove");
  }

  public async promoteMemberGroup({ participants, to }: WAutoGroupMemberActionOptions) {
    const { receiver: group, msg } = await this.validateReceiver({
      from: to,
      isGroup: true,
    } as IWAutoPhoneToJid);
    if (msg) throw new AutoWAError(msg);
    participants = participants.map((d) => phoneToJid({ from: d }));

    return await this.sock.groupParticipantsUpdate(group, participants, "promote");
  }

  public async demoteMemberGroup({ participants, to }: WAutoGroupMemberActionOptions) {
    const { receiver: group, msg } = await this.validateReceiver({
      from: to,
      isGroup: true,
    } as IWAutoPhoneToJid);
    if (msg) throw new AutoWAError(msg);
    participants = participants.map((d) => phoneToJid({ from: d }));

    return await this.sock.groupParticipantsUpdate(group, participants, "demote");
  }
}
