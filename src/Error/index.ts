export class AutoWAError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AutoWAError";
    Object.setPrototypeOf(this, AutoWAError.prototype);
  }

  static isAutoWAError(error: any): error is AutoWAError {
    return error instanceof AutoWAError || error instanceof Error;
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
