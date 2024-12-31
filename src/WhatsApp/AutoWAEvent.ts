import { CALLBACK_KEY } from "../Defaults";
import { IWAutoMessageReceived, IWAutoMessageSent, WAutoMessageUpdated } from "../Types";

export default class AutoWAEvent {
  private callback: Map<string, Function>;

  constructor(callback: Map<string, Function>) {
    this.callback = callback;
  }

  onQRUpdated = (listener: (qr: string) => any) => {
    this.callback.set(CALLBACK_KEY.ON_QR, listener);
  };

  onConnected = (listener: () => any) => {
    this.callback.set(CALLBACK_KEY.ON_CONNECTED, listener);
  };

  onDisconnected = (listener: () => any) => {
    this.callback.set(CALLBACK_KEY.ON_DISCONNECTED, listener);
  };

  onConnecting = (listener: () => any) => {
    this.callback.set(CALLBACK_KEY.ON_CONNECTING, listener);
  };

  onMessageUpdate = (listener: (data: WAutoMessageUpdated) => any) => {
    this.callback.set(CALLBACK_KEY.ON_MESSAGE_UPDATED, listener);
  };

  onPairingCode = (listener: (code: string) => any) => {
    this.callback.set(CALLBACK_KEY.ON_PAIRING_CODE, listener);
  };

  onMessage = (listener: (msg: IWAutoMessageReceived) => any) => {
    this.callback.set(CALLBACK_KEY.ON_MESSAGE, listener);
  };

  onGroupMessage = (listener: (msg: IWAutoMessageReceived) => any) => {
    this.callback.set(CALLBACK_KEY.ON_GROUP_MESSAGE, listener);
  };

  onPrivateMessage = (listener: (msg: IWAutoMessageReceived) => any) => {
    this.callback.set(CALLBACK_KEY.ON_PRIVATE_MESSAGE, listener);
  };

  onMessageReceived = (listener: (msg: IWAutoMessageReceived) => any) => {
    this.callback.set(CALLBACK_KEY.ON_MESSAGE_RECEIVED, listener);
  };

  onGroupMessageReceived = (listener: (msg: IWAutoMessageReceived) => any) => {
    this.callback.set(CALLBACK_KEY.ON_GROUP_MESSAGE_RECEIVED, listener);
  };

  onPrivateMessageReceived = (listener: (msg: IWAutoMessageReceived) => any) => {
    this.callback.set(CALLBACK_KEY.ON_PRIVATE_MESSAGE_RECEIVED, listener);
  };

  onMessageSent = (listener: (msg: IWAutoMessageSent) => any) => {
    this.callback.set(CALLBACK_KEY.ON_MESSAGE_SENT, listener);
  };

  onGroupMessageSent = (listener: (msg: IWAutoMessageSent) => any) => {
    this.callback.set(CALLBACK_KEY.ON_GROUP_MESSAGE_SENT, listener);
  };

  onPrivateMessageSent = (listener: (msg: IWAutoMessageSent) => any) => {
    this.callback.set(CALLBACK_KEY.ON_PRIVATE_MESSAGE_SENT, listener);
  };

  onStoryReceived = (listener: (msg: IWAutoMessageReceived) => any) => {
    this.callback.set(CALLBACK_KEY.ON_STORY_RECEIVED, listener);
  };

  onStorySent = (listener: (msg: IWAutoMessageSent) => any) => {
    this.callback.set(CALLBACK_KEY.ON_STORY_SENT, listener);
  };

  onReactionReceived = (listener: (msg: IWAutoMessageReceived) => any) => {
    this.callback.set(CALLBACK_KEY.ON_REACTION_RECEIVED, listener);
  };

  onReactionSent = (listener: (msg: IWAutoMessageSent) => any) => {
    this.callback.set(CALLBACK_KEY.ON_REACTION_SENT, listener);
  };
}
