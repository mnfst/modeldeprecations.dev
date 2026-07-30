// Length budgets for the <title> and <meta name="description"> the renderers
// emit. Google truncates titles around 60 characters and descriptions around
// 160, so anything past those limits is markup nobody reads. Each renderer
// offers several phrasings, richest first, and takes the best one that fits —
// instead of hardcoding a shape that overflows on the longest model names.

/** Titles are cut near 60 characters in the SERP. */
export const TITLE_MAX = 60;

/** Descriptions are cut near 160; 158 leaves room for the trailing period. */
export const DESCRIPTION_MAX = 158;

/** The first candidate that fits `max`, or the last (shortest) one if none do. */
export function fitText(candidates: string[], max: number): string {
  return candidates.find((candidate) => candidate.length <= max) ?? candidates.at(-1)!;
}

export function fitTitle(candidates: string[]): string {
  return fitText(candidates, TITLE_MAX);
}

export function fitDescription(candidates: string[]): string {
  return fitText(candidates, DESCRIPTION_MAX);
}

/**
 * Trim a sentence to `max` characters on a word boundary, ending in an ellipsis.
 * Used when the answer paragraph is itself the description and the model name
 * leaves no room for the whole thing.
 */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[,.;:]$/, "")}…`;
}
