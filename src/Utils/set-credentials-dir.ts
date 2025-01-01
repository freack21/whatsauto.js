import { CREDENTIALS } from "../Defaults";
import { ValidationError } from "../Error";

export const setCredentialsDir = (dirname: string) => {
  if (typeof dirname !== "string") {
    throw new ValidationError("Parameter dirname must be a string!");
  } else if (dirname === "") {
    throw new ValidationError("Parameter dirname must not be empty!");
  }
  CREDENTIALS.DIR_NAME = dirname;
};
