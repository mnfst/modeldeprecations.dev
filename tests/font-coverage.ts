// Reads the cmap of a vendored TTF so tests can assert that every character the
// OG cards draw is actually in the font.
//
// This matters because the cards are rasterized with `loadSystemFonts: false`:
// resvg has no fallback, so a missing glyph is silently drawn as a tofu box on a
// 1200×630 image that gets shared into feeds. A typographic character that looks
// fine in an editor — an arrow, a curly quote, an ellipsis — is exactly the kind
// of thing that slips through.

import fs from "node:fs";

/** Unicode code points present in a TrueType font's format-4 cmap subtable. */
export function fontCodePoints(path: string): Set<number> {
  const data = fs.readFileSync(path);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  let cmapOffset = 0;
  const tableCount = view.getUint16(4);
  for (let i = 0; i < tableCount; i++) {
    const record = 12 + 16 * i;
    const tag = String.fromCharCode(...data.subarray(record, record + 4));
    if (tag === "cmap") cmapOffset = view.getUint32(record + 8);
  }
  if (cmapOffset === 0) throw new Error(`no cmap table in ${path}`);

  let subtable = 0;
  const encodings = view.getUint16(cmapOffset + 2);
  for (let i = 0; i < encodings; i++) {
    const entry = cmapOffset + 4 + 8 * i;
    const platform = view.getUint16(entry);
    const encoding = view.getUint16(entry + 2);
    const unicodeBmp = platform === 3 && (encoding === 1 || encoding === 10);
    const unicodeAny = platform === 0;
    if (unicodeBmp || unicodeAny) subtable = cmapOffset + view.getUint32(entry + 4);
  }
  if (subtable === 0) throw new Error(`no Unicode cmap subtable in ${path}`);

  const format = view.getUint16(subtable);
  if (format !== 4) throw new Error(`unsupported cmap format ${format} in ${path}`);

  const points = new Set<number>();
  const segCount = view.getUint16(subtable + 6) / 2;
  const endBase = subtable + 14;
  const startBase = endBase + segCount * 2 + 2;
  for (let seg = 0; seg < segCount; seg++) {
    const end = view.getUint16(endBase + seg * 2);
    const start = view.getUint16(startBase + seg * 2);
    if (start === 0xffff && end === 0xffff) continue;
    for (let cp = start; cp <= end && cp <= 0xffff; cp++) points.add(cp);
  }
  return points;
}

/** Characters in `text` that the font cannot draw, ignoring whitespace. */
export function unrenderable(text: string, points: Set<number>): string[] {
  return [...text].filter((char) => !/\s/.test(char) && !points.has(char.codePointAt(0)!));
}
