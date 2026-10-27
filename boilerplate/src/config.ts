import type { Lang } from "./core/i18n.js";

const list = (value = "") =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

export interface BotConfig {
  name: string;
  sessionId: string;
  credentialsDir: string;
  pairingNumber?: string;
  owners: string[];
  prefixes: string[];
  prefixless: boolean;
  defaultLang: Lang;
  dataDir: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): BotConfig {
  return {
    name: env.BOT_NAME || "WhatsAuto Bot",
    sessionId: env.SESSION_ID || "main",
    credentialsDir: env.CREDENTIALS_DIR || "wa_creds",
    pairingNumber: env.PAIRING_NUMBER?.trim() || undefined,
    owners: list(env.OWNER_NUMBERS),
    prefixes: [...(env.PREFIXES ?? "!.-/#")].filter((char) => char.trim()),
    prefixless: env.PREFIXLESS === "true",
    defaultLang: env.DEFAULT_LANG === "en" ? "en" : "id",
    dataDir: env.DATA_DIR || "data",
  };
}
