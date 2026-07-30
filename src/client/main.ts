// The only client-side script on the site. Everything here is progressive
// enhancement over server-rendered HTML: with JS off, every page still shows its
// full content, and the homepage table is complete and readable.

import { setupWebMCP } from "./webmcp.js";

function setupProvidersMenu(): void {
  const toggle = document.querySelector<HTMLButtonElement>("[data-providers-toggle]");
  const menu = document.querySelector<HTMLElement>("[data-providers-menu]");
  const chevron = document.querySelector<SVGElement>("[data-providers-chevron]");
  if (!toggle || !menu) return;

  const setOpen = (open: boolean): void => {
    menu.classList.toggle("providers-menu-hidden", !open);
    toggle.setAttribute("aria-expanded", String(open));
    chevron?.classList.toggle("rotate-180", open);
  };
  setOpen(false);

  toggle.addEventListener("click", (event) => {
    event.stopPropagation();
    setOpen(menu.classList.contains("providers-menu-hidden"));
  });
  document.addEventListener("click", (event) => {
    if (!menu.contains(event.target as Node)) setOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setOpen(false);
  });
}

function setupHowToUseModal(): void {
  const dialog = document.getElementById("how-to-use") as HTMLDialogElement | null;
  if (!dialog || typeof dialog.showModal !== "function") return;

  const close = (): void => {
    if (dialog.open) dialog.close();
    document.documentElement.style.overflow = "";
  };
  document.querySelectorAll<HTMLButtonElement>("[data-open-how-to-use]").forEach((btn) =>
    btn.addEventListener("click", () => {
      dialog.showModal();
      document.documentElement.style.overflow = "hidden";
    }),
  );
  document
    .querySelectorAll<HTMLButtonElement>("[data-close-how-to-use]")
    .forEach((btn) => btn.addEventListener("click", close));
  dialog.addEventListener("cancel", close);
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) close();
  });
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the execCommand path */
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  document.body.removeChild(textarea);
  return copied;
}

function flashCopied(button: HTMLElement): void {
  const label = button.querySelector<HTMLElement>("[data-copy-label]");
  if (!label) return;
  const original = label.textContent ?? "Copy";
  label.textContent = "Copied";
  window.setTimeout(() => {
    label.textContent = original;
  }, 1600);
}

function setupCopyButtons(): void {
  document.querySelectorAll<HTMLButtonElement>("[data-copy-target]").forEach((button) => {
    button.addEventListener("click", async () => {
      const source = document.getElementById(button.dataset.copyTarget ?? "");
      if (!source) return;
      if (await copyText(source.textContent ?? "")) flashCopied(button);
    });
  });

  document.querySelectorAll<HTMLButtonElement>("[data-copy-text]").forEach((button) => {
    button.addEventListener("click", async () => {
      const value = button.dataset.copyText ?? "";
      const absolute = value.startsWith("http") ? value : `${location.origin}${value}`;
      if (await copyText(absolute)) flashCopied(button);
    });
  });

  const guideButton = document.querySelector<HTMLButtonElement>("[data-copy-how-to-use]");
  const guide = document.getElementById("how-to-use-md");
  if (guideButton && guide) {
    guideButton.addEventListener("click", async () => {
      if (await copyText(guide.textContent ?? "")) flashCopied(guideButton);
    });
  }
}

/**
 * Homepage table filtering. Rows carry their own searchable text and status, so
 * the filter never needs the catalog JSON — it works the instant the HTML lands.
 */
function setupTableFilter(): void {
  const table = document.querySelector<HTMLElement>("[data-model-table]");
  if (!table) return;
  const rows = [...table.querySelectorAll<HTMLTableRowElement>("tr[data-model-search]")];
  const search = document.querySelector<HTMLInputElement>("[data-search]");
  const buttons = [...document.querySelectorAll<HTMLButtonElement>("[data-status-filter]")];
  const empty = document.querySelector<HTMLElement>("[data-empty-state]");
  let status = "all";

  const apply = (): void => {
    const query = (search?.value ?? "").trim().toLowerCase();
    let visible = 0;
    for (const row of rows) {
      const matchesQuery = !query || (row.dataset.modelSearch ?? "").includes(query);
      const matchesStatus = status === "all" || row.dataset.modelStatus === status;
      const show = matchesQuery && matchesStatus;
      row.hidden = !show;
      if (show) visible += 1;
    }
    if (empty) empty.hidden = visible > 0;
  };

  // ?q= is the search endpoint the WebSite SearchAction advertises, so it has to
  // actually work: seed the box from the URL on load, and write the query back as
  // the user types so a filtered view is a shareable link.
  if (search) {
    const initial = new URLSearchParams(location.search).get("q");
    if (initial) search.value = initial;
    search.addEventListener("input", () => {
      const url = new URL(location.href);
      const query = search.value.trim();
      if (query) url.searchParams.set("q", query);
      else url.searchParams.delete("q");
      history.replaceState(null, "", url);
      apply();
    });
  }
  for (const button of buttons) {
    button.addEventListener("click", () => {
      status = button.dataset.statusFilter ?? "all";
      for (const other of buttons) {
        other.dataset.active = String(other === button);
      }
      apply();
    });
  }
  apply();
}

function main(): void {
  setupProvidersMenu();
  setupHowToUseModal();
  setupCopyButtons();
  setupTableFilter();
  setupWebMCP();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", main);
} else {
  main();
}
