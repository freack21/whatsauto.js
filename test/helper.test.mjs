import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import {
  phoneToJid,
  to,
  is,
  parseMessageStatusCodeToReadable,
  getMediaMimeType,
  getContextInfo,
  ValidationError,
} from "../dist/index.js";
import { makeWebpBuffer } from "../dist/Utils/make-stiker.js";
import { proto } from "@whiskeysockets/baileys";

describe("phoneToJid", () => {
  test("plain number -> user jid", () => {
    assert.equal(phoneToJid({ from: "6281234567890" }), "6281234567890@s.whatsapp.net");
    assert.equal(phoneToJid({ from: 6281234567890 }), "6281234567890@s.whatsapp.net");
  });

  test("strips formatting characters", () => {
    assert.equal(phoneToJid({ from: "+62 812-3456-7890" }), "6281234567890@s.whatsapp.net");
  });

  test("user jid with device suffix", () => {
    assert.equal(phoneToJid({ from: "6281234:12@s.whatsapp.net" }), "6281234@s.whatsapp.net");
    assert.equal(phoneToJid({ from: "6281234:12@s.whatsapp.net", reverse: true }), "6281234");
  });

  test("user jid reverse -> digits only", () => {
    assert.equal(phoneToJid({ from: "6281234@s.whatsapp.net", reverse: true }), "6281234");
    assert.equal(phoneToJid({ from: "+62 812", reverse: true }), "62812");
  });

  test("broadcast is returned unchanged", () => {
    assert.equal(phoneToJid({ from: "status@broadcast" }), "status@broadcast");
    assert.equal(phoneToJid({ from: "12345@broadcast", reverse: true }), "12345@broadcast");
  });

  test("jids on other servers are returned unchanged", () => {
    assert.equal(phoneToJid({ from: "123@hosted" }), "123@hosted");
    assert.equal(phoneToJid({ from: "123@hosted.lid" }), "123@hosted.lid");
    assert.equal(phoneToJid({ from: "13135550002@bot" }), "13135550002@bot");
  });

  test("c.us jids are normalized to s.whatsapp.net", () => {
    assert.equal(phoneToJid({ from: "6281234567890@c.us" }), "6281234567890@s.whatsapp.net");
  });

  test("newsletter is returned unchanged", () => {
    assert.equal(phoneToJid({ from: "120363000000@newsletter" }), "120363000000@newsletter");
    assert.equal(
      phoneToJid({ from: "120363000000@newsletter", reverse: true }),
      "120363000000@newsletter"
    );
  });

  test("lid is preserved", () => {
    assert.equal(phoneToJid({ from: "12345@lid" }), "12345@lid");
    assert.equal(phoneToJid({ from: "123:4@lid" }), "123@lid");
    assert.equal(phoneToJid({ from: "12345@lid", reverse: true }), "12345");
    assert.equal(phoneToJid({ from: "123:4@lid", reverse: true }), "123");
  });

  test("lid wins over isGroup flag", () => {
    assert.equal(phoneToJid({ from: "12345@lid", isGroup: true }), "12345@lid");
  });

  test("group ids", () => {
    assert.equal(phoneToJid({ from: "120363012345@g.us" }), "120363012345@g.us");
    assert.equal(phoneToJid({ from: "120363012345", isGroup: true }), "120363012345@g.us");
    assert.equal(phoneToJid({ from: "120363012345@g.us", reverse: true }), "120363012345");
    assert.equal(
      phoneToJid({ from: "120363012345", isGroup: true, reverse: true }),
      "120363012345"
    );
  });

  test("old-style group ids keep the dash", () => {
    assert.equal(phoneToJid({ from: "6281234-1600000000@g.us" }), "6281234-1600000000@g.us");
    assert.equal(
      phoneToJid({ from: "6281234-1600000000", isGroup: true }),
      "6281234-1600000000@g.us"
    );
    assert.equal(
      phoneToJid({ from: "6281234-1600000000@g.us", reverse: true }),
      "6281234-1600000000"
    );
  });

  test("empty input throws ValidationError", () => {
    for (const from of ["", undefined, null]) {
      assert.throws(
        () => phoneToJid({ from }),
        (err) => {
          assert.ok(err instanceof ValidationError);
          assert.equal(err.message, '"from" parameter is required!');
          return true;
        }
      );
    }
  });
});

describe("to", () => {
  test("to.string", () => {
    assert.equal(to.string("abc"), "abc");
    assert.equal(to.string(""), "");
    assert.equal(to.string(1), "");
    assert.equal(to.string(null), "");
    assert.equal(to.string(undefined), "");
    assert.equal(to.string({}), "");
  });

  test("to.undefined", () => {
    assert.equal(to.undefined("abc"), "abc");
    assert.equal(to.undefined(5), 5);
    assert.equal(to.undefined(0), 0);
    assert.equal(to.undefined(""), undefined);
    assert.equal(to.undefined(null), undefined);
    assert.equal(to.undefined({}), undefined);
    assert.equal(to.undefined("", "def"), "def");
    assert.equal(to.undefined(null, 7), 7);
  });
});

describe("is", () => {
  test("is.array", () => {
    assert.equal(is.array([1]), true);
    assert.equal(is.array([]), false);
    assert.equal(is.array(null), false);
    assert.equal(is.array("abc"), false);
  });

  test("is.undefined", () => {
    assert.equal(is.undefined(undefined), true);
    assert.equal(is.undefined(null), false);
    assert.equal(is.undefined(0), false);
  });

  test("is.object", () => {
    assert.equal(is.object({ a: 1 }), true);
    assert.equal(is.object({}), false);
    assert.equal(is.object(null), false);
    assert.equal(is.object("a"), false);
  });

  test("is.string", () => {
    assert.equal(is.string(""), true);
    assert.equal(is.string("a"), true);
    assert.equal(is.string(1), false);
    assert.equal(is.string(null), false);
  });

  test("is.file", () => {
    assert.equal(is.file("a"), false);
    assert.equal(is.file(null), false);
    assert.equal(is.file(Buffer.from("x")), false);
    if (typeof File !== "undefined") {
      assert.equal(is.file(new File(["x"], "x.txt")), true);
    }
  });

  test("is.file does not throw when File global is missing", () => {
    const original = globalThis.File;
    try {
      // simulate Node < 20
      delete globalThis.File;
      assert.equal(typeof globalThis.File, "undefined");
      assert.equal(is.file({}), false);
    } finally {
      globalThis.File = original;
    }
  });
});

describe("parseMessageStatusCodeToReadable", () => {
  const S = proto.WebMessageInfo.Status;
  test("maps status codes", () => {
    assert.equal(parseMessageStatusCodeToReadable(S.PENDING), "pending");
    assert.equal(parseMessageStatusCodeToReadable(S.SERVER_ACK), "server");
    assert.equal(parseMessageStatusCodeToReadable(S.DELIVERY_ACK), "delivered");
    assert.equal(parseMessageStatusCodeToReadable(S.READ), "read");
    assert.equal(parseMessageStatusCodeToReadable(S.PLAYED), "played");
    assert.equal(parseMessageStatusCodeToReadable(S.ERROR), "error");
    assert.equal(parseMessageStatusCodeToReadable(999), "error");
    assert.equal(parseMessageStatusCodeToReadable(undefined), "error");
  });
});

describe("getMediaMimeType", () => {
  test("returns empty string without message", () => {
    assert.equal(getMediaMimeType({}), "");
    assert.equal(getMediaMimeType({ message: null }), "");
    assert.equal(getMediaMimeType(undefined), "");
  });

  test("direct media messages", () => {
    assert.equal(getMediaMimeType({ message: { imageMessage: { mimetype: "image/jpeg" } } }), "image/jpeg");
    assert.equal(getMediaMimeType({ message: { videoMessage: { mimetype: "video/mp4" } } }), "video/mp4");
    assert.equal(getMediaMimeType({ message: { audioMessage: { mimetype: "audio/ogg" } } }), "audio/ogg");
    assert.equal(getMediaMimeType({ message: { stickerMessage: { mimetype: "image/webp" } } }), "image/webp");
    assert.equal(
      getMediaMimeType({ message: { documentMessage: { mimetype: "application/pdf" } } }),
      "application/pdf"
    );
  });

  test("non-media message -> empty string", () => {
    assert.equal(getMediaMimeType({ message: { conversation: "hi" } }), "");
  });

  test("unwraps documentWithCaptionMessage", () => {
    const msg = {
      message: {
        documentWithCaptionMessage: {
          message: { documentMessage: { mimetype: "application/pdf" } },
        },
      },
    };
    assert.equal(getMediaMimeType(msg), "application/pdf");
  });

  test("unwraps ephemeral / viewOnce / viewOnceV2 (nested too)", () => {
    const img = { imageMessage: { mimetype: "image/png" } };
    assert.equal(getMediaMimeType({ message: { ephemeralMessage: { message: img } } }), "image/png");
    assert.equal(getMediaMimeType({ message: { viewOnceMessage: { message: img } } }), "image/png");
    assert.equal(getMediaMimeType({ message: { viewOnceMessageV2: { message: img } } }), "image/png");
    assert.equal(
      getMediaMimeType({
        message: { ephemeralMessage: { message: { viewOnceMessageV2: { message: img } } } },
      }),
      "image/png"
    );
  });
});

describe("getContextInfo", () => {
  const ctx = { stanzaId: "ABC", participant: "123@s.whatsapp.net" };

  test("returns null without message", () => {
    assert.equal(getContextInfo({}), null);
    assert.equal(getContextInfo({ message: null }), null);
  });

  test("returns contextInfo of the content message", () => {
    assert.deepEqual(
      getContextInfo({ message: { extendedTextMessage: { text: "hi", contextInfo: ctx } } }),
      ctx
    );
  });

  test("skips messageContextInfo when it is the first key", () => {
    const msg = {
      message: {
        messageContextInfo: { deviceListMetadataVersion: 2 },
        extendedTextMessage: { text: "hi", contextInfo: ctx },
      },
    };
    assert.deepEqual(getContextInfo(msg), ctx);
  });

  test("unwraps ephemeral / viewOnce / viewOnceV2", () => {
    const inner = { imageMessage: { contextInfo: ctx } };
    assert.deepEqual(getContextInfo({ message: { ephemeralMessage: { message: inner } } }), ctx);
    assert.deepEqual(getContextInfo({ message: { viewOnceMessage: { message: inner } } }), ctx);
    assert.deepEqual(getContextInfo({ message: { viewOnceMessageV2: { message: inner } } }), ctx);
  });

  test("returns null when no contextInfo is present", () => {
    assert.equal(getContextInfo({ message: { conversation: "hi" } }), null);
    assert.equal(getContextInfo({ message: { extendedTextMessage: { text: "hi" } } }), null);
  });
});

// ---- makeWebpBuffer ----

const crc32 = (buf) => {
  let c;
  let crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const pngChunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

/** tiny 2x2 RGBA PNG */
const makePng = () => {
  const w = 2;
  const h = 2;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const o = y * (w * 4 + 1) + 1 + x * 4;
      raw[o] = 255;
      raw[o + 3] = 255;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
};

const hasFfmpeg = (() => {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

describe("makeWebpBuffer", () => {
  test("returns null for null media", async () => {
    assert.equal(await makeWebpBuffer({ media: null }), null);
  });

  test("returns null for non-existent path", async () => {
    const p = join(tmpdir(), `does-not-exist-${Date.now()}.png`);
    assert.equal(existsSync(p), false);
    assert.equal(await makeWebpBuffer({ media: p }), null);
  });

  test("returns null for garbage buffer (unknown file type)", async () => {
    assert.equal(await makeWebpBuffer({ media: Buffer.from("definitely not an image") }), null);
  });

  test("returns null for empty buffer", async () => {
    assert.equal(await makeWebpBuffer({ media: Buffer.alloc(0) }), null);
  });

  test("returns null for a truncated webp", async () => {
    const fake = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBPVP8 ")]);
    assert.equal(await makeWebpBuffer({ media: fake }), null);
  });

  test("returns null for an unreachable URL", async () => {
    assert.equal(await makeWebpBuffer({ media: "http://127.0.0.1:1/x.png" }), null);
  });

  test("converts a PNG buffer to webp sticker", { skip: !hasFfmpeg && "ffmpeg not installed" }, async () => {
    const out = await makeWebpBuffer({ media: makePng(), pack: "pack", author: "me" });
    assert.ok(Buffer.isBuffer(out));
    assert.equal(out.subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(out.subarray(8, 12).toString("ascii"), "WEBP");
    assert.ok(out.includes(Buffer.from('"sticker-pack-name":"pack"')));

    // already-webp input goes through the early-return path
    const again = await makeWebpBuffer({ media: out, pack: "p2" });
    assert.ok(Buffer.isBuffer(again));
    assert.ok(again.includes(Buffer.from('"sticker-pack-name":"p2"')));
  });
});
