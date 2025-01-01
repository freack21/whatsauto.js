const ffmpeg = require("fluent-ffmpeg");
const { Image } = require("node-webpmux");
import fs from "fs";
import { IStickerOptions } from "../Types";
import { randomBytes } from "crypto";

export const makeWebpBuffer = async (options: IStickerOptions): Promise<Buffer | null> => {
  const randomName = `./${Date.now()}${Math.random() * 1000}.webp`;
  let buffer: Buffer | null = null;

  const { filePath, pack = "", author = "", transparent = true, bgColor = "white" } = options;

  if (!filePath) return buffer;

  const data: string = JSON.stringify({
    "sticker-pack-id": generateStickerID(),
    "sticker-pack-name": pack,
    "sticker-pack-publisher": author,
    emojis: ["🤙"],
  });

  const exif = Buffer.concat([
    Buffer.from([
      0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00,
    ]),
    Buffer.from(data, "utf-8"),
  ]);
  exif.writeUIntLE(new TextEncoder().encode(data).length, 14, 4);

  const backgroundColor = transparent ? "color=white@0.0" : `color=${bgColor}`;

  return new Promise((resolve) => {
    ffmpeg(filePath)
      .input(filePath)
      .on("error", () => {
        fs.unlinkSync(filePath);
        resolve(buffer);
      })
      .on("end", async () => {
        let image = await (async () => {
          try {
            const img = new Image();
            await img.load(randomName);
            return img;
          } catch (error) {
            return resolve(buffer);
          }
        })();
        image.exif = exif;
        buffer = await image.save(null);
        fs.unlinkSync(filePath);
        fs.unlinkSync(randomName);
        resolve(buffer);
      })
      .addOutputOptions([
        `-vcodec`,
        `libwebp`,
        `-lavfi`,
        `scale='min(320,iw)':min'(320,ih)':force_original_aspect_ratio=decrease,fps=15, pad=320:320:-1:-1:${backgroundColor}, split [a][b]; [a] palettegen=reserve_transparent=on:transparency_color=ffffff [p]; [b][p] paletteuse`,
      ])
      .toFormat("webp")
      .save(randomName);
  });
};

export const generateStickerID = (): string => `WhatsAuto.js|${randomBytes(16).toString("hex")}`;
