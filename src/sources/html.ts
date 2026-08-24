import { NodeHtmlMarkdown } from "node-html-markdown";
import { HTMLElement, Node, NodeType, parse, TextNode } from "node-html-parser";
import type { SourceEntry } from "./registry.js";

const REMOVE_SELECTORS = [
  "script",
  "style",
  "noscript",
  "template",
  "svg",
  "button",
  "form",
  "nav",
  "footer",
  "header",
  "[hidden]",
  "[data-nosnippet]",
  ".nocontent",
  ".devsite-article-meta",
  ".devsite-content-footer",
  ".hash-link",
  ".md-content__button",
  ".md-source-file",
];

export type HtmlConversionErrorCode = "missing_selector" | "conversion_failed";

export class HtmlConversionError extends Error {
  constructor(
    readonly code: HtmlConversionErrorCode,
    message: string,
  ) {
    super(message);
  }
}

function directRows(table: HTMLElement): HTMLElement[] {
  return table.querySelectorAll("tr").filter((row) => row.closest("table") === table);
}

function directCells(row: HTMLElement): HTMLElement[] {
  return row.childNodes.filter(
    (node): node is HTMLElement =>
      node.nodeType === NodeType.ELEMENT_NODE && ["td", "th"].includes(node.rawTagName),
  );
}

function unwrapRowCells(root: HTMLElement): void {
  for (const row of root.querySelectorAll("tr")) {
    const cells = row.querySelectorAll("td,th").filter((cell) => cell.closest("tr") === row);
    if (cells.length > 0 && directCells(row).length !== cells.length) {
      row.set_content(cells.map((cell) => cell.outerHTML).join(""));
    }
  }
}

function splitPairedTableCells(root: HTMLElement): void {
  for (const cell of root.querySelectorAll("td,th")) {
    const children = cell.childNodes.filter(
      (node) => node.nodeType === NodeType.ELEMENT_NODE || node.textContent.trim() !== "",
    );
    if (children.length !== 1 || children[0]!.nodeType !== NodeType.ELEMENT_NODE) continue;
    const layout = children[0] as HTMLElement;
    if (!layout.classList.contains("justify-between")) continue;

    const parts = layout.childNodes.filter(
      (node) =>
        !(node.nodeType === NodeType.ELEMENT_NODE && node.rawTagName === "svg") &&
        (node.nodeType === NodeType.ELEMENT_NODE || node.textContent.trim() !== ""),
    );
    if (parts.length !== 2) continue;

    const attributes = cell.rawAttrs ? ` ${cell.rawAttrs}` : "";
    const first = parts[0]!.textContent.trim() === "" ? "" : parts[0]!.toString();
    const second = parts[1]!.textContent.trim() === "" ? "" : parts[1]!.toString();
    cell.set_content(first);
    cell.insertAdjacentHTML(
      "afterend",
      `<${cell.rawTagName}${attributes}>${second}</${cell.rawTagName}>`,
    );
  }
}

// A table rendered inside another table's cell is part of that cell's content,
// never the data half of a split header, so it is skipped on both sides of the
// pairing below.
function isNestedTable(table: HTMLElement): boolean {
  return !!(table.parentNode as HTMLElement | null)?.closest("table");
}

// The two halves of a split header are adjacent in document order but not
// necessarily siblings: a page may wrap each half in its own scroll container,
// so the halves share no parent to walk between.
function mergeSplitHeaderTables(root: HTMLElement): void {
  const tables = root.querySelectorAll("table");
  for (let index = 0; index < tables.length - 1; index += 1) {
    const headerTable = tables[index]!;
    const dataTable = tables[index + 1]!;
    if (isNestedTable(headerTable) || isNestedTable(dataTable)) continue;
    const headerRows = directRows(headerTable);
    const dataRows = directRows(dataTable);
    if (headerRows.length !== 1 || dataRows.length === 0) continue;

    const headerCells = directCells(headerRows[0]!);
    const firstDataCells = directCells(dataRows[0]!);
    if (
      headerCells.length === 0 ||
      !headerCells.every((cell) => cell.rawTagName === "th") ||
      firstDataCells.some((cell) => cell.rawTagName === "th") ||
      headerCells.length !== firstDataCells.length
    ) {
      continue;
    }

    dataTable.insertAdjacentHTML("afterbegin", `<thead>${headerRows[0]!.outerHTML}</thead>`);
    const container = headerTable.closest('[data-slot="table-container"]');
    if (container?.querySelectorAll("table").length === 1) container.remove();
    else headerTable.remove();
  }
}

function flattenedCell(cell: HTMLElement, content?: string): string {
  const clone = cell.clone() as HTMLElement;
  clone.removeAttribute("rowspan");
  clone.removeAttribute("colspan");
  if (content !== undefined) clone.set_content(content);
  return clone.outerHTML;
}

// HTML reads a span it cannot parse as 1 rather than as an error, and colspan
// has no zero. Only rowspan="0" carries meaning: span to the end of the row
// group. Returning 0 for it defers that to flattenTableSpans, the only place
// that knows where the group ends.
function spanValue(cell: HTMLElement, name: "rowspan" | "colspan"): number {
  const raw = cell.getAttribute(name)?.trim();
  if (!raw) return 1;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) return 1;
  if (value === 0) return name === "rowspan" ? 0 : 1;
  return value;
}

// The last row of the row group (thead, tbody, tfoot, or the table itself when
// the markup has no groups) holding the row at rowIndex.
function rowGroupEnd(rows: HTMLElement[], rowIndex: number): number {
  const group = rows[rowIndex]!.parentNode;
  let end = rowIndex;
  while (end + 1 < rows.length && rows[end + 1]!.parentNode === group) end += 1;
  return end;
}

function flattenTableSpans(table: HTMLElement): void {
  const rows = directRows(table);
  const pending = new Map<number, { html: string; remaining: number }>();

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex]!;
    const flattened: string[] = [];
    let column = 0;

    const appendPending = (): void => {
      const active = pending.get(column)!;
      flattened.push(active.html);
      active.remaining -= 1;
      if (active.remaining === 0) pending.delete(column);
      column += 1;
    };

    // A rowspan never reaches past its own row group, so an oversized one is
    // clamped rather than failing the whole page.
    const availableRows = rowGroupEnd(rows, rowIndex) - rowIndex + 1;

    for (const cell of directCells(row)) {
      while (pending.has(column)) appendPending();
      const declared = spanValue(cell, "rowspan");
      const rowSpan = declared === 0 ? availableRows : Math.min(declared, availableRows);
      const columnSpan = spanValue(cell, "colspan");
      for (let span = 0; span < columnSpan; span += 1) {
        while (pending.has(column)) appendPending();
        const html = flattenedCell(cell, span === 0 ? undefined : "");
        flattened.push(html);
        if (rowSpan > 1) pending.set(column, { html, remaining: rowSpan - 1 });
        column += 1;
      }
    }

    const remainingColumns = [...pending.keys()].filter((pendingColumn) => pendingColumn >= column);
    if (remainingColumns.length > 0) {
      const lastColumn = Math.max(...remainingColumns);
      while (column <= lastColumn) {
        if (pending.has(column)) appendPending();
        else {
          flattened.push("<td></td>");
          column += 1;
        }
      }
    }
    row.set_content(flattened.join(""));
  }

  if (pending.size > 0) throw new Error("table rowspan exceeds available rows");
}

function repairMissingProviderCells(table: HTMLElement): void {
  const rows = directRows(table);
  const header = rows.find((row) => {
    const cells = directCells(row);
    return cells.length > 0 && cells.every((cell) => cell.rawTagName === "th");
  });
  if (!header) return;

  const labels = directCells(header).map((cell) => cell.textContent.trim().toLowerCase());
  if (labels[0] !== "model provider" || labels[2] !== "model id") return;
  const expected = labels.length;

  for (const row of rows) {
    const cells = directCells(row);
    if (cells.length !== expected - 1) continue;
    const match = /^([a-z0-9-]+)\./.exec(cells[1]?.textContent.trim() ?? "");
    if (!match) continue;
    const provider = match[1]!
      .split("-")
      .map((part) => `${part[0]!.toUpperCase()}${part.slice(1)}`)
      .join(" ");
    row.insertAdjacentHTML("afterbegin", `<td>${provider}</td>`);
  }
}

function validateTableColumns(table: HTMLElement): void {
  const rows = directRows(table);
  const header = rows.find((row) => {
    const cells = directCells(row);
    return cells.length > 0 && cells.every((cell) => cell.rawTagName === "th");
  });
  if (!header) return;

  const expected = directCells(header).length;
  for (const row of rows) {
    const actual = directCells(row).length;
    if (actual !== expected) throw new Error(`table row has ${actual} cells; expected ${expected}`);
  }
}

function normalizeTables(root: HTMLElement): void {
  unwrapRowCells(root);
  splitPairedTableCells(root);
  mergeSplitHeaderTables(root);
  for (const table of root.querySelectorAll("table")) {
    flattenTableSpans(table);
    repairMissingProviderCells(table);
    validateTableColumns(table);
  }
  root.querySelectorAll("td br,th br").forEach((lineBreak) => lineBreak.replaceWith(" "));
}

function promoteStandaloneBold(root: HTMLElement): void {
  for (const node of root.querySelectorAll("b,strong")) {
    if (node.closest("p,li,td,th,h1,h2,h3,h4,h5,h6,a,blockquote,pre,code")) continue;
    const parent = node.parentNode;
    const hasTextSibling = parent.childNodes.some(
      (sibling) =>
        sibling !== node && sibling.nodeType === NodeType.TEXT_NODE && !!sibling.textContent.trim(),
    );
    const hasBlockSibling = parent.childNodes.some(
      (sibling) =>
        sibling.nodeType === NodeType.ELEMENT_NODE &&
        ["div", "h1", "h2", "h3", "h4", "h5", "h6", "ol", "p", "table", "ul"].includes(
          sibling.rawTagName,
        ),
    );
    if (!hasTextSibling && hasBlockSibling) node.replaceWith(`<p>${node.outerHTML}</p>`);
  }
}

function removeUiLabels(root: HTMLElement): void {
  root
    .querySelectorAll("h1,h2,h3,h4,h5,h6")
    .filter((heading) => /\(click to expand\)\s*$/i.test(heading.textContent))
    .forEach((heading) => heading.remove());
  root
    .querySelectorAll("span")
    .filter((label) => label.textContent.trim() === "Scroll for more")
    .forEach((label) => label.parentNode.remove());
}

const INLINE_ELEMENTS = new Set([
  "a",
  "abbr",
  "b",
  "code",
  "del",
  "em",
  "i",
  "img",
  "kbd",
  "mark",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "time",
  "u",
]);

function isInlineContent(node: Node | undefined): boolean {
  if (!node) return false;
  if (node.nodeType === NodeType.TEXT_NODE) return node.textContent.trim() !== "";
  return node.nodeType === NodeType.ELEMENT_NODE && INLINE_ELEMENTS.has(node.rawTagName);
}

function hasInlineNeighbor(node: Node, offset: -1 | 1): boolean {
  let current = node;
  while (current.parentNode) {
    const siblings = current.parentNode.childNodes;
    const neighbor = siblings[siblings.indexOf(current) + offset];
    if (neighbor) return isInlineContent(neighbor);
    if (!INLINE_ELEMENTS.has(current.parentNode.rawTagName)) return false;
    current = current.parentNode;
  }
  return false;
}

function normalizeTextWhitespace(node: Node, preserve = false): void {
  if (node.nodeType === NodeType.TEXT_NODE) {
    if (!preserve) {
      const text = node as TextNode;
      let normalized = text.rawText.replace(/[ \t\r\n\f]+/g, " ");
      if (!hasInlineNeighbor(text, -1)) normalized = normalized.trimStart();
      if (!hasInlineNeighbor(text, 1)) normalized = normalized.trimEnd();
      text.rawText = normalized;
    }
    return;
  }
  if (node.nodeType !== NodeType.ELEMENT_NODE) return;
  const element = node as HTMLElement;
  const preserveChildren = preserve || ["code", "pre"].includes(element.rawTagName);
  element.childNodes.forEach((child) => normalizeTextWhitespace(child, preserveChildren));
}

function removeNoise(root: ReturnType<typeof parse>): void {
  for (const selector of REMOVE_SELECTORS) {
    root.querySelectorAll(selector).forEach((node) => node.remove());
  }
}

function conversionCause(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const sanitized = [...message]
    .map((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127 ? " " : character;
    })
    .join("")
    .trim();
  return sanitized.slice(0, 200) || "unknown error";
}

export function convertHtml(source: SourceEntry, html: string): string {
  try {
    const document = parse(html);
    const root = document.querySelector(source.html_selector ?? "");
    if (!root) {
      throw new HtmlConversionError("missing_selector", "HTML content selector did not match");
    }
    normalizeTables(root);
    promoteStandaloneBold(root);
    removeUiLabels(root);
    removeNoise(root);
    normalizeTextWhitespace(root);
    return NodeHtmlMarkdown.translate(root.innerHTML, {
      bulletMarker: "-",
      codeBlockStyle: "fenced",
      keepDataImages: false,
      maxConsecutiveNewlines: 2,
      useInlineLinks: true,
    });
  } catch (error) {
    if (error instanceof HtmlConversionError) throw error;
    throw new HtmlConversionError(
      "conversion_failed",
      `HTML conversion failed: ${conversionCause(error)}`,
    );
  }
}
