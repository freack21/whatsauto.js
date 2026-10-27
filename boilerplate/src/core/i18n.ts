export const LANGS = ["en", "id"] as const;
export type Lang = (typeof LANGS)[number];

/** A text in every supported language, or one text used for all of them. */
export type Text = string | Record<Lang, string>;
export type Texts = Record<string, Text>;
export type Vars = Record<string, string | number>;

export const isLang = (value: unknown): value is Lang => LANGS.includes(value as Lang);

/** Pick the language variant of a text and replace `{name}` placeholders. */
export function format(text: Text, lang: Lang, vars: Vars = {}): string {
  const raw = typeof text === "string" ? text : text[lang] ?? text.en;
  return raw.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  );
}

/** Texts used by the framework itself. Commands can override any key in their own `texts`. */
export const coreTexts: Texts = {
  owner_only: {
    en: "This command is for the bot owner only.",
    id: "Perintah ini khusus pemilik bot.",
  },
  group_only: {
    en: "This command can only be used in groups.",
    id: "Perintah ini hanya bisa dipakai di grup.",
  },
  private_only: {
    en: "This command can only be used in private chat.",
    id: "Perintah ini hanya bisa dipakai di chat pribadi.",
  },
  group_admin_only: {
    en: "Only group admins can use this command.",
    id: "Hanya admin grup yang bisa memakai perintah ini.",
  },
  cooldown: {
    en: "Please wait {seconds}s before using this command again.",
    id: "Tunggu {seconds} detik sebelum memakai perintah ini lagi.",
  },
  invalid_param: {
    en: "Invalid value for *{param}*.",
    id: "Nilai *{param}* tidak valid.",
  },
  session_prompt: {
    en: "{prompt}\n\n_Reply to continue, or send *cancel* to stop._",
    id: "{prompt}\n\n_Balas untuk melanjutkan, atau kirim *batal* untuk berhenti._",
  },
  session_cancelled: {
    en: "Cancelled.",
    id: "Dibatalkan.",
  },
  error: {
    en: "Something went wrong, please try again later.",
    id: "Terjadi kesalahan, coba lagi nanti.",
  },
};
