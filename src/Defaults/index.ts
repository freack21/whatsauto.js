import {
  IGroupMemberUpdate,
  IWAutoMessage,
  IWAutoDeleteMessage,
  WAutoMessageUpdated,
} from "../Types/index.js";

export abstract class CREDENTIALS {
  static DIR_NAME: string = "wa_creds";
  static PREFIX: string = "_creds";
}

export type AutoWAEvents = {
  connecting: [];
  qr: [string];
  "pairing-code": [string];
  connected: [];
  disconnected: [];

  message: [IWAutoMessage];
  "group-message": [IWAutoMessage];
  "private-message": [IWAutoMessage];
  "message-received": [IWAutoMessage];
  "group-message-received": [IWAutoMessage];
  "private-message-received": [IWAutoMessage];
  "message-sent": [IWAutoMessage];
  "group-message-sent": [IWAutoMessage];
  "private-message-sent": [IWAutoMessage];
  story: [IWAutoMessage];
  "story-received": [IWAutoMessage];
  "story-sent": [IWAutoMessage];
  reaction: [IWAutoMessage];
  "reaction-received": [IWAutoMessage];
  "reaction-sent": [IWAutoMessage];
  "group-reaction": [IWAutoMessage];
  "group-reaction-received": [IWAutoMessage];
  "group-reaction-sent": [IWAutoMessage];
  "private-reaction": [IWAutoMessage];
  "private-reaction-received": [IWAutoMessage];
  "private-reaction-sent": [IWAutoMessage];

  "message-updated": [WAutoMessageUpdated];
  "group-member-update": [IGroupMemberUpdate];

  "message-deleted": [IWAutoDeleteMessage];
};

export abstract class Messages {
  static sessionAlreadyExist = (sessionId: string): string =>
    `Session ID "${sessionId}" is already exist, Try another Session ID.`;

  static sessionNotFound = (sessionId: string): string =>
    `Session with ID "${sessionId}" Not Exist!`;

  static paremetersRequired = (props: string[] | string) =>
    `Parameter ${
      typeof props == "string" ? props : props instanceof Array ? props.join(", ") : ""
    } is required`;

  static paremetersNotValid = (props: string[] | string) =>
    `Parameter ${
      typeof props == "string" ? props : props instanceof Array ? props.join(", ") : ""
    } is not valid`;
}
