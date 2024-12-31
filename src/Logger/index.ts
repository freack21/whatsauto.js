export default class Logger {
  private name: string;

  constructor(name: string) {
    this.name = name;
  }

  public debug(message: any): void {
    console.debug({ name: this.name, message });
  }

  public info(message: any): void {
    console.info({ name: this.name, message });
  }

  public error(message: any): void {
    console.error({ name: this.name, message });
  }
}
