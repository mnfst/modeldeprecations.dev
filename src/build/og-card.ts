// Composes the social-share card for a page as an SVG string. Pure — no I/O and
// no rasterizer — so the layout is unit-testable and the same markup feeds both
// the PNG writer and any future preview tooling.
//
// Text is laid out by estimating advance widths from the font size, because
// resvg has no text-measurement API and the card only needs to avoid overflow,
// not typeset precisely.

const WIDTH = 1200;
const HEIGHT = 630;
const MARGIN = 80;
const CONTENT = WIDTH - MARGIN * 2;

const INK = "#0f172a";
const MUTED = "#475569";
const FAINT = "#94a3b8";
const ACCENT = "#2530F0";
const CHIP_BG = "#f1f5f9";

/** The traffic light. A shared card should read at a glance, from colour alone. */
export const STATUS_COLORS: Record<string, string> = {
  active: "#15803d",
  deprecated: "#b45309",
  retired: "#b91c1c",
};

/** Rough advance width per character as a fraction of font size, by weight. */
const ADVANCE = { bold: 0.58, regular: 0.52 };

export interface OgCard {
  /** Small accent line above the headline, e.g. the provider. */
  eyebrow?: string;
  /** The page subject, set as large as it fits on up to two lines. */
  headline: string;
  /** One line of supporting facts, e.g. "Shuts down October 23, 2026". */
  subline?: string;
  /** Status word rendered as a coloured pill. */
  status?: string;
  /** Extra pills, e.g. the replacement id. Dropped when they overflow. */
  chips?: string[];
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function widthOf(text: string, size: number, weight: keyof typeof ADVANCE): number {
  return text.length * size * ADVANCE[weight];
}

/** Largest size in [min, max] at which `text` fits `maxWidth` on one line. */
function fitSize(text: string, maxWidth: number, max: number, min: number): number {
  if (text.length === 0) return max;
  return Math.max(min, Math.min(max, Math.floor(maxWidth / (text.length * ADVANCE.bold))));
}

/** Split into at most `maxLines` lines that each fit `maxWidth`, ellipsising the rest. */
function wrap(text: string, size: number, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line.length === 0 ? word : `${line} ${word}`;
    if (widthOf(candidate, size, "bold") <= maxWidth || line.length === 0) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    }
  }
  if (lines.length < maxLines && line.length > 0) lines.push(line);
  if (lines.length === maxLines && words.join(" ") !== lines.join(" ")) {
    const last = lines[maxLines - 1]!;
    lines[maxLines - 1] = `${last.slice(0, Math.max(0, last.length - 1))}…`;
  }
  return lines;
}

function text(
  content: string,
  x: number,
  y: number,
  size: number,
  weight: number,
  fill: string,
): string {
  return `<text x="${x}" y="${y}" font-family="Outfit" font-size="${size}" font-weight="${weight}" fill="${fill}">${escapeXml(content)}</text>`;
}

/** The brand lockup: accent tile with a crossed-out rule, then the wordmark. */
function brandMark(): string {
  return [
    `<rect x="${MARGIN}" y="70" width="56" height="56" rx="12" fill="${ACCENT}" />`,
    `<path d="M${MARGIN + 15} ${70 + 20}h26M${MARGIN + 15} ${70 + 29}h18" stroke="#ffffff" stroke-width="4.5" stroke-linecap="round" fill="none" />`,
    `<path d="M${MARGIN + 15} ${70 + 42}l26 -6" stroke="#ffffff" stroke-width="4.5" stroke-linecap="round" opacity="0.55" fill="none" />`,
    text("modeldeprecations.dev", MARGIN + 74, 116, 30, 600, INK),
  ].join("");
}

/** The status pill, sized to its text and coloured by lifecycle state. */
function statusPill(status: string, y: number): string {
  const size = 30;
  const padX = 22;
  const height = 52;
  const label = status.toUpperCase();
  const width = Math.round(widthOf(label, size, "bold")) + padX * 2;
  const color = STATUS_COLORS[status.toLowerCase()] ?? MUTED;
  return [
    `<rect x="${MARGIN}" y="${y}" width="${width}" height="${height}" rx="10" fill="${color}" />`,
    text(label, MARGIN + padX, y + 36, size, 700, "#ffffff"),
  ].join("");
}

/** Pills laid out left to right until the row is full. */
function chipRow(chips: string[], y: number): string {
  const size = 24;
  const padX = 16;
  const height = 44;
  const gap = 12;
  const out: string[] = [];
  let x = MARGIN;
  for (const chip of chips) {
    const width = Math.round(widthOf(chip, size, "regular")) + padX * 2;
    if (x + width > MARGIN + CONTENT) break;
    out.push(
      `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="8" fill="${CHIP_BG}" />`,
      text(chip, x + padX, y + 30, size, 400, MUTED),
    );
    x += width + gap;
  }
  return out.join("");
}

/**
 * The full 1200×630 card. The top rule takes the status colour so the verdict is
 * legible in a timeline before any text is read.
 */
export function renderOgCard(card: OgCard): string {
  const headSize = fitSize(card.headline, CONTENT, 84, 40);
  const lines = wrap(card.headline, headSize, CONTENT, 2);
  const headTop = lines.length > 1 ? 258 : 290;
  const rule = card.status ? (STATUS_COLORS[card.status.toLowerCase()] ?? ACCENT) : ACCENT;

  const parts = [
    `<rect width="${WIDTH}" height="${HEIGHT}" fill="#ffffff" />`,
    `<rect width="${WIDTH}" height="12" fill="${rule}" />`,
    brandMark(),
  ];
  if (card.eyebrow) parts.push(text(card.eyebrow, MARGIN, 208, 28, 600, ACCENT));
  lines.forEach((line, index) => {
    parts.push(text(line, MARGIN, headTop + index * (headSize + 10), headSize, 700, INK));
  });
  const afterHead = headTop + (lines.length - 1) * (headSize + 10);
  if (card.status) parts.push(statusPill(card.status, afterHead + 34));
  if (card.subline) parts.push(text(card.subline, MARGIN, afterHead + 138, 32, 400, MUTED));
  if (card.chips && card.chips.length > 0) parts.push(chipRow(card.chips, afterHead + 168));
  parts.push(
    text("Is it deprecated? When does it shut down? What replaces it?", MARGIN, 588, 22, 400, FAINT),
  );

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">${parts.join("")}</svg>`;
}
