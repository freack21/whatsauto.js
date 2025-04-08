import { proto } from "@whiskeysockets/baileys";
import { IWAutoMessage, WAutoMessageUpdated } from "../Types";
import { ValidationError } from "../Error";
import * as fs from "fs";
import path from "path";
import { CREDENTIALS } from "../Defaults";

export const getMediaMimeType = (msg: IWAutoMessage): string => {
  if (!msg?.message) return "";
  if (msg.message?.documentWithCaptionMessage)
    msg = { ...msg, message: msg.message.documentWithCaptionMessage.message };
  else if (msg.message?.ephemeralMessage)
    msg = { ...msg, message: msg.message.ephemeralMessage.message };

  const {
    imageMessage,
    stickerMessage,
    videoMessage,
    documentMessage,
    audioMessage,
    documentWithCaptionMessage,
  } = msg?.message;

  return to.string(
    imageMessage?.mimetype ??
      stickerMessage?.mimetype ??
      audioMessage?.mimetype ??
      videoMessage?.mimetype ??
      documentMessage?.mimetype ??
      documentWithCaptionMessage?.message?.documentMessage?.mimetype
  );
};

export const parseMessageStatusCodeToReadable = (
  code: proto.WebMessageInfo.Status
): WAutoMessageUpdated["messageStatus"] => {
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
  to,
  isGroup = false,
  reverse = false,
}: {
  to: string | number;
  isGroup?: boolean;
  reverse?: boolean;
}): string => {
  if (!to) throw new ValidationError('"to" parameter is required!');
  let number = to.toString();
  if (number.includes("@broadcast")) return number;

  if (isGroup || number.includes("@g.us")) {
    number = number.replace(/\s|[+]|[-]/gim, "");
    if (!number.includes("@g.us")) number = number + "@g.us";
    if (reverse) number = number.replace("@g.us", "");
  } else {
    number = number.replace(/\s|[+]|[-]/gim, "");
    if (!number.includes("@s.whatsapp.net")) number = number + "@s.whatsapp.net";
    if (reverse) number = number.replace("@s.whatsapp.net", "");
  }

  return number;
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
    return file instanceof File;
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
