import PHONENUMBER_MCC, { proto } from "@whiskeysockets/baileys";
import { IWAutoMessage, WAutoMessageUpdated } from "../Types";
import { ValidationError } from "../Error";

export const getMediaMimeType = (msg: IWAutoMessage): string => {
  if (!msg?.message) return "";
  if (msg.message.documentWithCaptionMessage)
    msg = { ...msg, message: msg.message.documentWithCaptionMessage.message };

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
  if (code == proto.WebMessageInfo.Status.PENDING) return "pending";
  if (code == proto.WebMessageInfo.Status.SERVER_ACK) return "server";
  if (code == proto.WebMessageInfo.Status.DELIVERY_ACK) return "delivered";
  if (code == proto.WebMessageInfo.Status.READ) return "read";
  if (code == proto.WebMessageInfo.Status.PLAYED) return "played";

  return "error";
};

export const isPhoneNumberValidCountry = (phone: string) => {
  return Object.keys(PHONENUMBER_MCC).some((key) => {
    return phone.startsWith(key);
  });
};

export const phoneToJid = ({
  to,
  isGroup = false,
}: {
  to: string | number;
  isGroup?: boolean;
}): string => {
  if (!to) throw new ValidationError('Parameter "to" is required!');
  let number = to.toString();
  if (isGroup) {
    number = number.replace(/\s|[+]|[-]/gim, "");
    if (!number.includes("@g.us")) number = number + "@g.us";
  } else {
    number = number.replace(/\s|[+]|[-]/gim, "");
    if (!number.includes("@s.whatsapp.net")) number = number + "@s.whatsapp.net";
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
