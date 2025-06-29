import { blue, red, green, yellow, gray, cyan } from "colorette";
import { AutoWA } from "../WhatsApp";

export default class Logger {
  private name: string;
  private autoWA: AutoWA;

  constructor(name: string, autoWA: AutoWA) {
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
