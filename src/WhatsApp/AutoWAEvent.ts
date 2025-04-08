import { CALLBACK_KEY } from "../Defaults";
import {
  GroupMemberUpdate,
  IWAutoMessageReceived,
  IWAutoMessageSent,
  WAutoMessageComplete,
  WAutoMessageUpdated,
} from "../Types";

export default class AutoWAEvent {
  private callback: Map<string, Function>;

  constructor(callback: Map<string, Function>) {
    this.callback = callback;
  }

  onQRUpdated = (listener: (qr: string) => void) => {
    this.callback.set(CALLBACK_KEY.ON_QR, listener);
  };

  onConnected = (listener: () => void) => {
    this.callback.set(CALLBACK_KEY.ON_CONNECTED, listener);
  };

  onDisconnected = (listener: () => void) => {
    this.callback.set(CALLBACK_KEY.ON_DISCONNECTED, listener);
  };

  onConnecting = (listener: () => void) => {
    this.callback.set(CALLBACK_KEY.ON_CONNECTING, listener);
  };

  onMessageUpdate = (listener: (data: WAutoMessageUpdated) => void) => {
    this.callback.set(CALLBACK_KEY.ON_MESSAGE_UPDATED, listener);
  };

  onPairingCode = (listener: (code: string) => void) => {
    this.callback.set(CALLBACK_KEY.ON_PAIRING_CODE, listener);
  };

  onMessage = (listener: (msg: WAutoMessageComplete) => void) => {
    this.callback.set(CALLBACK_KEY.ON_MESSAGE, listener);
  };

  onGroupMessage = (listener: (msg: WAutoMessageComplete) => void) => {
    this.callback.set(CALLBACK_KEY.ON_GROUP_MESSAGE, listener);
  };

  onPrivateMessage = (listener: (msg: WAutoMessageComplete) => void) => {
    this.callback.set(CALLBACK_KEY.ON_PRIVATE_MESSAGE, listener);
  };

  onMessageReceived = (listener: (msg: IWAutoMessageReceived) => void) => {
    this.callback.set(CALLBACK_KEY.ON_MESSAGE_RECEIVED, listener);
  };

  onGroupMessageReceived = (listener: (msg: IWAutoMessageReceived) => void) => {
    this.callback.set(CALLBACK_KEY.ON_GROUP_MESSAGE_RECEIVED, listener);
  };

  onPrivateMessageReceived = (listener: (msg: IWAutoMessageReceived) => void) => {
    this.callback.set(CALLBACK_KEY.ON_PRIVATE_MESSAGE_RECEIVED, listener);
  };

  onMessageSent = (listener: (msg: IWAutoMessageSent) => void) => {
    this.callback.set(CALLBACK_KEY.ON_MESSAGE_SENT, listener);
  };

  onGroupMessageSent = (listener: (msg: IWAutoMessageSent) => void) => {
    this.callback.set(CALLBACK_KEY.ON_GROUP_MESSAGE_SENT, listener);
  };

  onPrivateMessageSent = (listener: (msg: IWAutoMessageSent) => void) => {
    this.callback.set(CALLBACK_KEY.ON_PRIVATE_MESSAGE_SENT, listener);
  };

  onStory = (listener: (msg: WAutoMessageComplete) => void) => {
    this.callback.set(CALLBACK_KEY.ON_STORY, listener);
  };

  onStoryReceived = (listener: (msg: IWAutoMessageReceived) => void) => {
    this.callback.set(CALLBACK_KEY.ON_STORY_RECEIVED, listener);
  };

  onStorySent = (listener: (msg: IWAutoMessageSent) => void) => {
    this.callback.set(CALLBACK_KEY.ON_STORY_SENT, listener);
  };

  onReaction = (listener: (msg: WAutoMessageComplete) => void) => {
    this.callback.set(CALLBACK_KEY.ON_REACTION, listener);
  };

  onReactionReceived = (listener: (msg: IWAutoMessageReceived) => void) => {
    this.callback.set(CALLBACK_KEY.ON_REACTION_RECEIVED, listener);
  };

  onReactionSent = (listener: (msg: IWAutoMessageSent) => void) => {
    this.callback.set(CALLBACK_KEY.ON_REACTION_SENT, listener);
  };

  onGroupReaction = (listener: (msg: WAutoMessageComplete) => void) => {
    this.callback.set(CALLBACK_KEY.ON_GROUP_REACTION, listener);
  };

  onGroupReactionReceived = (listener: (msg: IWAutoMessageReceived) => void) => {
    this.callback.set(CALLBACK_KEY.ON_GROUP_REACTION_RECEIVED, listener);
  };

  onGroupReactionSent = (listener: (msg: IWAutoMessageSent) => void) => {
    this.callback.set(CALLBACK_KEY.ON_GROUP_REACTION_SENT, listener);
  };

  onPrivateReaction = (listener: (msg: WAutoMessageComplete) => void) => {
    this.callback.set(CALLBACK_KEY.ON_PRIVATE_REACTION, listener);
  };

  onPrivateReactionReceived = (listener: (msg: IWAutoMessageReceived) => void) => {
    this.callback.set(CALLBACK_KEY.ON_PRIVATE_REACTION_RECEIVED, listener);
  };

  onPrivateReactionSent = (listener: (msg: IWAutoMessageSent) => void) => {
    this.callback.set(CALLBACK_KEY.ON_PRIVATE_REACTION_SENT, listener);
  };

  onGroupMemberUpdate = (listener: (msg: GroupMemberUpdate) => void) => {
    this.callback.set(CALLBACK_KEY.ON_GROUP_MEMBER_UPDATE, listener);
  };
}
