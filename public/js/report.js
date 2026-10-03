import { markTitleRejected, metaForUrl, titleForUrl } from "./images.js";

const STORAGE_KEY = "quiquiz:reported:v1";

function loadReported() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((t) => typeof t === "string") : [];
  } catch {
    return [];
  }
}

function saveReported(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 400)));
  } catch {
    /* ignore */
  }
}

export function hydrateReportedTitles() {
  for (const title of loadReported()) markTitleRejected(title);
}

export function rememberReportedLocally(title) {
  const clean = String(title || "").trim();
  if (!clean) return;
  markTitleRejected(clean);
  const list = loadReported();
  if (!list.includes(clean)) {
    list.push(clean);
    saveReported(list);
  }
}

export function wasReportedLocally(title) {
  const clean = String(title || "").trim();
  if (!clean) return false;
  return loadReported().includes(clean);
}

async function postReport(body) {
  try {
    const res = await fetch("/api/reports", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    return res.ok || res.status === 429;
  } catch {
    return false;
  }
}

/**
 * Auto-validation : bonne réponse + image non signalée (localement).
 * Les autres joueurs peuvent encore signaler ensuite.
 */
export function confirmGoodImage({ name, title, url } = {}) {
  const cleanName = String(name || "").trim();
  const cleanTitle = String(title || "").trim();
  const source = String(url || "").trim();
  if (!cleanName || !cleanTitle || !source) return;
  if (source.includes("placeholder")) return;
  if (source.startsWith("/api/media/")) return;
  if (wasReportedLocally(cleanTitle)) return;
  const meta = metaForUrl(source);
  void fetch("/api/confirm-image", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      name: cleanName,
      title: cleanTitle,
      url: meta.sourceUrl || source,
    }),
  }).catch(() => {});
}

export function attachReportControl(host, options = {}) {
  if (!host) return;
  host.querySelector("[data-report-mod]")?.remove();

  const name = String(options.name || "").trim();
  const url = options.url || "";
  if (!name || !url || String(url).includes("placeholder")) return;

  const meta = metaForUrl(url);
  const title = options.title || meta.title || titleForUrl(url);
  if (!title) return;

  const bar = document.createElement("div");
  bar.className = "report-mod";
  bar.dataset.reportMod = "true";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "report-btn";
  btn.textContent = "Signaler";
  btn.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!window.confirm("Signaler cette image comme incorrecte ou inappropriée ?")) return;
    btn.disabled = true;
    rememberReportedLocally(title);
    void postReport({
      name,
      title,
      url: meta.sourceUrl || url,
      categoryId: options.categoryId || "",
    });
    bar.remove();
    options.onReported?.({ title, name, url, host });
  });
  bar.appendChild(btn);
  host.appendChild(bar);
}
