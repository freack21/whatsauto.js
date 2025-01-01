export abstract class CREDENTIALS {
  static DIR_NAME: string = "wa_creds";
  static PREFIX: string = "_creds";
}

export enum CALLBACK_KEY {
  ON_MESSAGE = "message",
  ON_GROUP_MESSAGE = "group-message",
  ON_PRIVATE_MESSAGE = "private-message",
  ON_MESSAGE_RECEIVED = "message-received",
  ON_GROUP_MESSAGE_RECEIVED = "group-message-received",
  ON_PRIVATE_MESSAGE_RECEIVED = "private-message-received",
  ON_MESSAGE_SENT = "message-sent",
  ON_GROUP_MESSAGE_SENT = "group-message-sent",
  ON_PRIVATE_MESSAGE_SENT = "private-message-sent",
  ON_STORY = "story",
  ON_STORY_RECEIVED = "story-received",
  ON_STORY_SENT = "story-sent",
  ON_REACTION = "reaction",
  ON_REACTION_RECEIVED = "reaction-received",
  ON_REACTION_SENT = "reaction-sent",
  ON_GROUP_REACTION = "group-reaction",
  ON_GROUP_REACTION_RECEIVED = "group-reaction-received",
  ON_GROUP_REACTION_SENT = "group-reaction-sent",
  ON_PRIVATE_REACTION = "private-reaction",
  ON_PRIVATE_REACTION_RECEIVED = "private-reaction-received",
  ON_PRIVATE_REACTION_SENT = "private-reaction-sent",
  ON_QR = "qr",
  ON_CONNECTED = "connected",
  ON_DISCONNECTED = "disconnected",
  ON_CONNECTING = "connecting",
  ON_MESSAGE_UPDATED = "message-updated",
  ON_PAIRING_CODE = "pairing-code",
}

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
