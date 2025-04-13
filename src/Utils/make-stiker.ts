import fs from "fs";
import { IStickerOptions } from "../Types";
import { randomBytes } from "crypto";
import { fromBuffer } from "file-type";
import { Image } from "node-webpmux";
import { tmpdir } from "os";
import { ensureDir, remove } from "fs-extra";
import { join } from "path";
import Ffmpeg from "fluent-ffmpeg";

export const makeWebpBuffer = async (options: IStickerOptions): Promise<Buffer | null> => {
  const getRandomName = () => `${Math.random().toString(36).slice(2)}.webp`;

  let buffer: Buffer | null = null;

  let { media, pack = "", author = "" } = options;

  if (!media) return buffer;

  const tempDir = join(tmpdir(), `webp_${Math.random().toString(36).slice(2)}`);
  await ensureDir(tempDir);

  const inputName = join(tempDir, typeof media == "string" ? media : getRandomName());
  const webpName = join(tempDir, getRandomName());

  const data: string = JSON.stringify({
    "sticker-pack-id": generateStickerID(),
    "sticker-pack-name": pack,
    "sticker-pack-publisher": author,
    emojis: ["🐾"],
  });

  const exif = Buffer.concat([
    Buffer.from([
      0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00,
    ]),
    Buffer.from(data, "utf-8"),
  ]);
  exif.writeUIntLE(new TextEncoder().encode(data).length, 14, 4);

  const getStickerBuffer = async (buffer: Buffer) => {
    const img = new Image();
    await img.load(buffer);
    img.exif = exif;
    return await img.save(null);
  };

  if (Buffer.isBuffer(media)) {
    fs.writeFileSync(inputName, media);
  } else if (typeof media == "string") {
    media = fs.readFileSync(media);
  } else {
    return buffer;
  }

  const { mime } = await fromBuffer(media);
  if (mime.includes("webp")) {
    return await getStickerBuffer(media);
  }

  return new Promise((resolve) => {
    Ffmpeg(inputName)
      .input(inputName)
      .on("error", async () => {
        await remove(tempDir);
        resolve(buffer);
      })
      .on("end", async () => {
        buffer = await getStickerBuffer(fs.readFileSync(webpName));
        await remove(tempDir);
        resolve(buffer);
      })
      .addOutputOptions([
        `-vcodec`,
        `libwebp`,
        `-lavfi`,
        `scale='min(512,iw)':'min(512,ih)':force_original_aspect_ratio=decrease,fps=15, pad=512:512:-1:-1:color=white@0.0, split [a][b]; [a] palettegen=reserve_transparent=on:transparency_color=ffffff [p]; [b][p] paletteuse`,
      ])
      .toFormat("webp")
      .save(webpName);
  });
};

export const generateStickerID = (): string => `whatsauto.js|${randomBytes(16).toString("hex")}`;
