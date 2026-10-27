import { blue, red, green, yellow, gray, cyan } from "colorette";

/**
 * Minimal shape the logger needs (satisfied by AutoWA). Kept structural to
 * avoid a runtime circular import with ../WhatsApp.
 */
export interface LoggerOwner {
  options: { logging?: boolean };
}

export default class Logger {
  private name: string;
  private autoWA: LoggerOwner;

  constructor(name: string, autoWA: LoggerOwner) {
    this.name = name;
    this.autoWA = autoWA;
  }

  private formatMessage(level: string, message: any): string {
    const levelColors: Record<string, (text: string) => string> = {
      DEBUG: blue,
      INFO: green,
      WARN: yellow,
      ERROR: red,
    };

    const timestamp = new Date().toISOString();
    const tag = levelColors[level](`[${level}]`);
    const scope = cyan(`[${this.name}]`);
    const msg = typeof message === "string" ? message : JSON.stringify(message, null, 2);

    return `${gray(timestamp)} ${tag} ${scope} ${msg}`;
  }

  public debug(message: any) {
    this.autoWA.options.logging && console.debug(this.formatMessage("DEBUG", message));
  }

  public info(message: any) {
    this.autoWA.options.logging && console.info(this.formatMessage("INFO", message));
  }

  public warn(message: any) {
    this.autoWA.options.logging && console.warn(this.formatMessage("WARN", message));
  }

  public error(message: any) {
    this.autoWA.options.logging && console.error(this.formatMessage("ERROR", message));
  }
}
