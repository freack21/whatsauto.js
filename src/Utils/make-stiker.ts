import fs from "fs";
import { createSticker, IStickerOptions } from "wa-sticker-formatter";

export const makeWebpBuffer = async ({
  media,
  ...opts
}: IStickerOptions & {
  media?: string | Buffer;
}): Promise<Buffer | null> => {
  let buffer: Buffer | null = null;

  try {
    if (!media) return buffer;

    if (typeof media == "string") media = fs.readFileSync(media);

    buffer = await createSticker(media, {
      categories: ["⭐️"],
      ...opts,
    });
  } catch (error) {}
  return buffer;
};
