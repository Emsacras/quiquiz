/**
 * Hash router minimal : #/, #/quiz/:id, #/quiz/:id/levels, #/ref/:id, #/fiche/:id/:name, #/revise/:id
 */

function encodeName(name) {
  return encodeURIComponent(String(name || "").trim());
}

function decodeName(value) {
  try {
    return decodeURIComponent(String(value || ""));
  } catch {
    return String(value || "");
  }
}

export function parseHash(hash = location.hash) {
  const raw = String(hash || "").replace(/^#/, "");
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  const parts = path.split("/").filter(Boolean);
  if (!parts.length) return { name: "home" };
  if (parts[0] === "quiz" && parts[1] && parts[2] === "levels") {
    return { name: "levels", categoryId: parts[1] };
  }
  if (parts[0] === "quiz" && parts[1]) {
    return { name: "quiz-entry", categoryId: parts[1] };
  }
  if (parts[0] === "ref" && parts[1]) {
    return { name: "reference", categoryId: parts[1] };
  }
  if (parts[0] === "fiche" && parts[1] && parts[2]) {
    return { name: "fiche", categoryId: parts[1], scientificName: decodeName(parts[2]) };
  }
  if (parts[0] === "revise" && parts[1]) {
    return { name: "revise", categoryId: parts[1] };
  }
  return { name: "home" };
}

export function setHashRoute(route) {
  let next = "#/";
  if (!route || route.name === "home") next = "#/";
  else if (route.name === "levels" || route.name === "quiz-entry") {
    next = route.name === "levels" ? `#/quiz/${route.categoryId}/levels` : `#/quiz/${route.categoryId}`;
  } else if (route.name === "reference") next = `#/ref/${route.categoryId}`;
  else if (route.name === "fiche") {
    next = `#/fiche/${route.categoryId}/${encodeName(route.scientificName)}`;
  } else if (route.name === "revise") next = `#/revise/${route.categoryId}`;
  if (location.hash === next) return;
  history.replaceState(null, "", next);
}

export function onHashChange(handler) {
  window.addEventListener("hashchange", () => handler(parseHash()));
}
