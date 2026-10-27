import { proto, WAMessage } from "@whiskeysockets/baileys";
import { IWAutoMessage, IWAutoPhoneToJid, WAutoMessageUpdated } from "../Types/index.js";
import { ValidationError } from "../Error/index.js";
import * as fs from "fs";
import path from "path";
import { CREDENTIALS } from "../Defaults/index.js";
import axios from "axios";

const unwrapMessage = (m: proto.IMessage | null | undefined): proto.IMessage | null | undefined => {
  // unwrap nested wrapper messages (ephemeral / viewOnce / documentWithCaption)
  for (let i = 0; i < 5 && m; i++) {
    const inner =
      m.ephemeralMessage?.message ??
      m.viewOnceMessage?.message ??
      m.viewOnceMessageV2?.message ??
      m.documentWithCaptionMessage?.message;
    if (!inner) break;
    m = inner;
  }
  return m;
};

export const getMediaMimeType = (msg: IWAutoMessage): string => {
  const message = unwrapMessage(msg?.message);
  if (!message) return "";

  const { imageMessage, stickerMessage, videoMessage, documentMessage, audioMessage } = message;

  return to.string(
    imageMessage?.mimetype ??
      stickerMessage?.mimetype ??
      audioMessage?.mimetype ??
      videoMessage?.mimetype ??
      documentMessage?.mimetype
  );
};

export const parseMessageStatusCodeToReadable = (
  code: proto.WebMessageInfo.Status
): Exclude<WAutoMessageUpdated["messageStatus"], "unknown"> => {
  switch (code) {
    case proto.WebMessageInfo.Status.PENDING:
      return "pending";
    case proto.WebMessageInfo.Status.SERVER_ACK:
      return "server";
    case proto.WebMessageInfo.Status.DELIVERY_ACK:
      return "delivered";
    case proto.WebMessageInfo.Status.READ:
      return "read";
    case proto.WebMessageInfo.Status.PLAYED:
      return "played";
    default:
      return "error";
  }
};

export const phoneToJid = ({
  from,
  isGroup = false,
  reverse = false,
}: IWAutoPhoneToJid): string => {
  if (!from) throw new ValidationError('"from" parameter is required!');
  const number = from.toString();
  if (number.includes("@broadcast")) return number;
  if (number.endsWith("@newsletter")) return number;

  // keep jids on other servers (hosted, hosted.lid, bot, ...) unchanged
  const server = number.includes("@") ? number.split("@")[1] : "";
  if (server && !["s.whatsapp.net", "c.us", "g.us", "lid"].includes(server)) return number;

  // local part without domain and device suffix (e.g. "123:4@lid" -> "123")
  const user = number.split("@")[0].replace(/:\d+$/, "");

  if (number.endsWith("@lid")) {
    const lid = user.replace(/\D/g, "");
    return reverse ? lid : lid + "@lid";
  }

  if (isGroup || number.endsWith("@g.us")) {
    // keep "-" for old-style group ids like "6281234-1600000000@g.us"
    const groupId = user.replace(/[^\d-]/g, "");
    return reverse ? groupId : groupId + "@g.us";
  }

  const formatted = user.replace(/\D/g, "");
  return reverse ? formatted : formatted + "@s.whatsapp.net";
};

export const createDelay = async (duration: number = 1000) => {
  return await new Promise((resolve) =>
    setTimeout(() => {
      resolve(true);
    }, duration)
  );
};

export const is = {
  array: (array: any): boolean => {
    return typeof array === "object" && array != null && array.length > 0;
  },
  undefined: (elem: any): boolean => {
    return typeof elem === "undefined";
  },
  file: (file: any): boolean => {
    return typeof File !== "undefined" && file instanceof File;
  },
  object: (object: any): boolean => {
    return typeof object === "object" && object != null && Object.keys(object).length > 0;
  },
  string: (str: any): boolean => {
    return typeof str === "string";
  },
};

export const to = {
  string: (str: any): string => {
    if (typeof str === "string") return str;
    return "";
  },
  undefined: (str: any, defaultValue: any = undefined): string | number | undefined => {
    if ((typeof str === "string" || typeof str === "number") && str !== "") return str;
    return defaultValue;
  },
};

export const isSessionExist = function (sessionId: string) {
  if (
    fs.existsSync(path.resolve(CREDENTIALS.DIR_NAME)) &&
    fs.existsSync(path.resolve(CREDENTIALS.DIR_NAME, sessionId + CREDENTIALS.PREFIX)) &&
    fs.readdirSync(path.resolve(CREDENTIALS.DIR_NAME, sessionId + CREDENTIALS.PREFIX)).length
  ) {
    return true;
  }
  return false;
};

export const setCredentialsDir = (dirname: string) => {
  if (typeof dirname !== "string") {
    throw new ValidationError("Parameter dirname must be a string!");
  } else if (dirname === "") {
    throw new ValidationError("Parameter dirname must not be empty!");
  }
  CREDENTIALS.DIR_NAME = dirname;
};

/**
 * Download a URL into a Buffer. Resolves to `null` if the request fails.
 */
export const getBuffer = async (url: string): Promise<Buffer | null> => {
  try {
    const response = await axios.get(url, {
      responseType: "arraybuffer",
    });

    return Buffer.from(response.data);
  } catch {
    return null;
  }
};

export function getRandomFromArrays<T extends unknown[][]>(
  ...arrays: T
): {
  [K in keyof T]: T[K] extends (infer U)[] ? U : never;
} {
  return arrays.map((arr) => {
    const randomIndex = Math.floor(Math.random() * arr.length);
    return arr[randomIndex];
  }) as any;
}

export function getContextInfo(msg: WAMessage): proto.IContextInfo | null {
  const m = unwrapMessage(msg?.message);
  if (!m) return null;

  // pick the first content key that carries a contextInfo
  // (the first key may be e.g. "messageContextInfo")
  for (const value of Object.values(m)) {
    if (value && typeof value === "object" && "contextInfo" in value && value.contextInfo) {
      return value.contextInfo as proto.IContextInfo;
    }
  }
  return null;
}
