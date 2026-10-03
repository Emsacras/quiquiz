import { markTitleRejected, metaForUrl, titleForUrl } from "./images.js";

let adminReady = false;
let isAdminUser = false;

export function isAdmin() {
  return isAdminUser;
}

export async function loadAdminSession() {
  try {
    const res = await fetch("/admin/session", {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      isAdminUser = false;
    } else {
      const data = await res.json();
      isAdminUser = Boolean(data?.isAdmin);
    }
  } catch {
    isAdminUser = false;
  }
  adminReady = true;
  document.documentElement.classList.toggle("is-admin", isAdminUser);
  return isAdminUser;
}

async function postMod(path, body) {
  const res = await fetch(`/api/admin/photos/${path}`, {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

function resolveMeta(url, extras = {}) {
  const meta = metaForUrl(url);
  const title = extras.title || meta.title || titleForUrl(url);
  const validated =
    extras.validated != null ? Boolean(extras.validated) : Boolean(meta.validated);
  const sourceUrl = extras.sourceUrl || meta.sourceUrl || "";
  const downloadUrl =
    sourceUrl ||
    (typeof url === "string" && url.startsWith("https://") ? url : "");
  return { title, validated, sourceUrl, downloadUrl, url };
}

export function attachPhotoMod(host, options = {}) {
  if (!adminReady || !isAdminUser || !host) return;
  const name = String(options.name || "").trim();
  const url = options.url || "";
  if (!name || !url || url.includes("placeholder")) {
    host.querySelector("[data-admin-mod]")?.remove();
    return;
  }

  const meta = resolveMeta(url, options);
  if (!meta.title) {
    host.querySelector("[data-admin-mod]")?.remove();
    return;
  }

  host.querySelector("[data-admin-mod]")?.remove();

  const bar = document.createElement("div");
  bar.className = "admin-mod";
  bar.dataset.adminMod = "true";

  const badge = document.createElement("span");
  badge.className = meta.validated ? "admin-mod-badge is-ok" : "admin-mod-badge";
  badge.textContent = meta.validated ? "Validée" : "Candidate";
  bar.appendChild(badge);

  const setBusy = (busy) => {
    for (const button of bar.querySelectorAll("button")) button.disabled = busy;
  };

  const onDone = typeof options.onDone === "function" ? options.onDone : null;

  if (!meta.validated) {
    const validateBtn = document.createElement("button");
    validateBtn.type = "button";
    validateBtn.className = "admin-mod-btn admin-mod-btn--ok";
    validateBtn.textContent = "Valider";
    validateBtn.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!meta.downloadUrl) {
        window.alert("URL source absente — impossible de valider.");
        return;
      }
      setBusy(true);
      const { res, data } = await postMod("validate", {
        name,
        title: meta.title,
        url: meta.downloadUrl,
      });
      if (!res.ok) {
        window.alert(data.error || `Erreur ${res.status}`);
        setBusy(false);
        return;
      }
      attachPhotoMod(host, {
        name,
        url: data.item?.url || url,
        title: meta.title,
        validated: true,
        sourceUrl: meta.downloadUrl,
        onDone,
      });
      onDone?.({ action: "validate", name, title: meta.title });
    });
    bar.appendChild(validateBtn);
  }

  const blacklistBtn = document.createElement("button");
  blacklistBtn.type = "button";
  blacklistBtn.className = "admin-mod-btn admin-mod-btn--bad";
  blacklistBtn.textContent = "Blacklist";
  blacklistBtn.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!window.confirm(`Blacklist « ${meta.title} » ?`)) return;
    setBusy(true);
    const { res, data } = await postMod("blacklist", {
      name,
      title: meta.title,
      url: meta.downloadUrl || meta.sourceUrl || url,
    });
    if (!res.ok) {
      window.alert(data.error || `Erreur ${res.status}`);
      setBusy(false);
      return;
    }
    markTitleRejected(meta.title);
    bar.remove();
    onDone?.({ action: "blacklist", name, title: meta.title, host });
  });
  bar.appendChild(blacklistBtn);

  host.appendChild(bar);
}

export function syncPhotoModFromImg(host, img, scientificName, onDone) {
  if (!img || !scientificName) return;
  const url = img.currentSrc || img.src;
  if (!url || img.hidden || img.dataset.final === "1") return;
  const meta = metaForUrl(url);
  attachPhotoMod(host, {
    name: scientificName,
    url,
    title: img.dataset.photoTitle || meta.title,
    validated: img.dataset.validated === "1" || meta.validated,
    sourceUrl: img.dataset.sourceUrl || meta.sourceUrl,
    onDone,
  });
}
