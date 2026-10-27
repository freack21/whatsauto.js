import { EventEmitter } from "events";

export default class AutoWAEvent<Events extends Record<string, any[]>> {
  private emitter = new EventEmitter();

  on<K extends keyof Events>(event: K, listener: (...args: Events[K]) => void): this {
    this.emitter.on(event as string, listener);
    return this;
  }

  once<K extends keyof Events>(event: K, listener: (...args: Events[K]) => void): this {
    this.emitter.once(event as string, listener);
    return this;
  }

  off<K extends keyof Events>(event: K, listener: (...args: Events[K]) => void): this {
    this.emitter.off(event as string, listener);
    return this;
  }

  emit<K extends keyof Events>(event: K, ...args: Events[K]): boolean {
    return this.emitter.emit(event as string, ...args);
  }

  removeAllListeners<K extends keyof Events>(event?: K): this {
    // an explicit undefined would be treated as an event name by EventEmitter
    if (event === undefined) this.emitter.removeAllListeners();
    else this.emitter.removeAllListeners(event as string);
    return this;
  }
}
