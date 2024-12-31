export class WhatsAppError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WhatsAppError";
    Object.setPrototypeOf(this, WhatsAppError.prototype);
  }

  static isWhatsAppError(error: any): error is WhatsAppError {
    return error instanceof WhatsAppError || error instanceof Error;
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
    Object.setPrototypeOf(this, ValidationError.prototype);
  }

  static isValidationError(error: any): error is ValidationError {
    return error instanceof ValidationError || error instanceof Error;
  }
}
