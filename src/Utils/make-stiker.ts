import fs from "fs";
import { IStickerOptions } from "../Types/index.js";
import { randomBytes } from "crypto";
import FileType from "file-type";
import webpmux from "node-webpmux";
import { tmpdir } from "os";
import { ensureDir, remove } from "fs-extra";
import { join } from "path";
import Ffmpeg from "fluent-ffmpeg";
import { getBuffer } from "./helper.js";

const { Image } = webpmux;
const { fromBuffer } = FileType;

export const makeWebpBuffer = async (options: IStickerOptions): Promise<Buffer | null> => {
  const getRandomName = (ext: string) => `${Math.random().toString(36).slice(2)}.${ext}`;

  const { media, pack = "", author = "" } = options ?? ({} as IStickerOptions);

  if (!media) return null;

  let mediaBuffer: Buffer | null = null;
  try {
    if (Buffer.isBuffer(media)) {
      mediaBuffer = media;
    } else if (typeof media == "string") {
      if (/^https?:\/\//i.test(media)) {
        mediaBuffer = await getBuffer(media);
      } else if (fs.existsSync(media) && fs.statSync(media).isFile()) {
        mediaBuffer = fs.readFileSync(media);
      }
    }
  } catch {
    mediaBuffer = null;
  }
  if (!mediaBuffer || !mediaBuffer.length) return null;

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

  const getStickerBuffer = async (buffer: Buffer): Promise<Buffer> => {
    const img = new Image();
    await img.load(buffer);
    img.exif = exif;
    return await img.save(null);
  };

  let tempDir: string | null = null;
  try {
    const type = await fromBuffer(mediaBuffer);
    if (!type?.mime) return null;

    if (type.mime.includes("webp")) {
      return await getStickerBuffer(mediaBuffer);
    }

    tempDir = join(tmpdir(), `webp_${Math.random().toString(36).slice(2)}`);
    await ensureDir(tempDir);

    const inputName = join(tempDir, getRandomName(type.ext));
    const webpName = join(tempDir, getRandomName("webp"));
    fs.writeFileSync(inputName, mediaBuffer);

    const converted = await new Promise<boolean>((resolve) => {
      Ffmpeg(inputName)
        .on("error", () => resolve(false))
        .on("end", () => resolve(true))
        .addOutputOptions([
          "-vcodec",
          "libwebp",
          "-filter_complex",
          "[0:v] fps=15,scale=512:512:force_original_aspect_ratio=decrease:eval=frame,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=white@0.0,split [a][b]; [a] palettegen=reserve_transparent=on:transparency_color=ffffff [p]; [b][p] paletteuse",
        ])
        .toFormat("webp")
        .save(webpName);
    });

    if (!converted || !fs.existsSync(webpName)) return null;
    return await getStickerBuffer(fs.readFileSync(webpName));
  } catch {
    return null;
  } finally {
    if (tempDir) await remove(tempDir).catch(() => {});
  }
};

export const generateStickerID = (): string => `whatsauto.js|${randomBytes(16).toString("hex")}`;
