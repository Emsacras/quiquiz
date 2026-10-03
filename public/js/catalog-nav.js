/** Navigation catalogue : arbre récursif + tags région. */

export const REGION_META = {
  france: { id: "france", nom: "France", description: "Tous les quiz tagués France." },
  "royaume-uni": {
    id: "royaume-uni",
    nom: "Royaume-Uni",
    description: "Tous les quiz tagués Royaume-Uni.",
  },
  monde: { id: "monde", nom: "Monde", description: "Quiz à l’échelle mondiale." },
};

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function lieuToLeaf(lieu) {
  const id = String(lieu.id || "").trim();
  const regions = asArray(lieu.regions).length
    ? asArray(lieu.regions).map(String)
    : id
      ? [id]
      : [];
  return {
    id: lieu.id,
    nom: lieu.nom,
    description: lieu.description || "",
    fichier: lieu.fichier,
    aVenir: Boolean(lieu.aVenir),
    regions,
  };
}

function branchToNode(branch) {
  if (asArray(branch.lieux).length) {
    return {
      id: branch.id,
      nom: branch.nom,
      description: branch.description || "",
      children: branch.lieux.map(lieuToLeaf),
    };
  }
  return {
    id: branch.id,
    nom: branch.nom,
    description: branch.description || "",
    fichier: branch.fichier,
    aVenir: Boolean(branch.aVenir),
    regions: asArray(branch.regions).length
      ? asArray(branch.regions).map(String)
      : branch.fichier
        ? ["france"]
        : [],
  };
}

function themeToNode(theme) {
  if (asArray(theme.branches).length) {
    return {
      id: theme.id,
      nom: theme.nom,
      description: theme.description || "",
      children: theme.branches.map(branchToNode),
    };
  }
  return {
    id: theme.id,
    nom: theme.nom,
    description: theme.description || "",
    fichier: theme.fichier,
    aVenir: Boolean(theme.aVenir),
    regions: asArray(theme.regions).length
      ? asArray(theme.regions).map(String)
      : theme.id === "geographie"
        ? ["monde"]
        : theme.fichier
          ? ["france"]
          : [],
  };
}

/** Convertit l’ancien format themes/branches/lieux ou renvoie domains tel quel. */
export function normalizeCatalog(raw) {
  if (!raw || Array.isArray(raw)) return { domains: [] };
  if (Array.isArray(raw.domains)) {
    return { domains: raw.domains };
  }

  const themes = asArray(raw.themes);
  const bioChildren = [];
  const domains = [];

  for (const theme of themes) {
    const node = themeToNode(theme);
    if (theme.id === "geographie" || theme.id === "geography") {
      domains.push({
        id: "geographie",
        nom: theme.nom || "Géographie",
        description: theme.description || "",
        children: node.children
          ? node.children
          : [
              {
                id: node.id,
                nom: node.nom,
                description: node.description,
                fichier: node.fichier,
                aVenir: node.aVenir,
                regions: node.regions,
              },
            ],
      });
      continue;
    }
    bioChildren.push(node);
  }

  if (bioChildren.length) {
    domains.unshift({
      id: "biologie",
      nom: "Biologie",
      description: "Vivant : animaux, plantes, champignons…",
      children: bioChildren,
    });
  }

  return { domains };
}

export function isLeaf(node) {
  if (!node) return false;
  if (asArray(node.children).length) return false;
  return Boolean(node.fichier || node.aVenir);
}

export function isFolder(node) {
  return asArray(node?.children).length > 0;
}

export function findNodeByPath(domains, pathIds) {
  let nodes = asArray(domains);
  let current = null;
  for (const id of pathIds || []) {
    current = nodes.find((node) => node.id === id) || null;
    if (!current) return null;
    nodes = asArray(current.children);
  }
  return current;
}

/** Feuilles jouables / à venir sous un nœud (récursif). */
export function collectLeaves(node, trail = []) {
  if (!node) return [];
  if (isLeaf(node)) {
    return [
      {
        id: node.id,
        nom: node.nom,
        description: node.description || "",
        fichier: node.fichier || "",
        aVenir: Boolean(node.aVenir),
        regions: asArray(node.regions).map(String),
        trail: trail.map((item) => item.nom),
        trailIds: trail.map((item) => item.id),
      },
    ];
  }
  const out = [];
  const nextTrail = [...trail, { id: node.id, nom: node.nom }];
  for (const child of asArray(node.children)) {
    out.push(...collectLeaves(child, nextTrail));
  }
  return out;
}

export function collectAllLeaves(domains) {
  const out = [];
  for (const domain of asArray(domains)) {
    out.push(...collectLeaves(domain, []));
  }
  return out;
}

export function leafDisplayLabel(leaf) {
  const trail = asArray(leaf?.trail);
  if (trail.length >= 1) {
    return `${trail[trail.length - 1]} · ${leaf.nom}`;
  }
  return leaf?.nom || leaf?.id || "Quiz";
}

export function playableLeaves(leaves) {
  return asArray(leaves).filter((leaf) => leaf.fichier && !leaf.aVenir);
}

export function listRegions(domains) {
  const counts = new Map();
  for (const leaf of collectAllLeaves(domains)) {
    if (!leaf.fichier || leaf.aVenir) continue;
    for (const regionId of asArray(leaf.regions)) {
      counts.set(regionId, (counts.get(regionId) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([id, count]) => {
      const meta = REGION_META[id] || {
        id,
        nom: id,
        description: `Quiz tagués « ${id} ».`,
      };
      return { ...meta, count };
    })
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
}

export function leavesForRegion(domains, regionId) {
  const id = String(regionId || "");
  return collectAllLeaves(domains).filter((leaf) => asArray(leaf.regions).includes(id));
}

export function findNodeById(domains, nodeId) {
  const walk = (nodes) => {
    for (const node of asArray(nodes)) {
      if (node.id === nodeId) return node;
      const nested = walk(node.children);
      if (nested) return nested;
    }
    return null;
  };
  return walk(domains);
}

/** Liste plate des feuilles pour l’admin (et index). */
export function flattenCatalogLeaves(catalog) {
  const normalized = normalizeCatalog(catalog);
  return collectAllLeaves(normalized.domains)
    .filter((leaf) => leaf.fichier)
    .map((leaf) => ({
      id: leaf.id,
      nom: leafDisplayLabel(leaf),
      description: leaf.description || "",
      fichier: leaf.fichier,
      kicker: leaf.trail[0] || leaf.nom,
      regions: leaf.regions,
    }));
}

export function regionSessionId(regionId) {
  return `region-${String(regionId || "").trim()}`;
}

export function parseRegionSessionId(categoryId) {
  const value = String(categoryId || "");
  if (!value.startsWith("region-")) return "";
  return value.slice("region-".length);
}
