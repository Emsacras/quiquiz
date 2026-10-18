/**
 * Génère sitemap.xml (homepage seule) et synchronise la liste des quiz
 * dans public/index.html (JSON-LD ItemList + noscript).
 *
 * Usage: node scripts/build-sitemap.mjs
 * (aussi : npm run sitemap)
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const catalogPath = path.join(root, "public/data/catalog.json");
const indexPath = path.join(root, "public/index.html");
const sitemapPath = path.join(root, "public/sitemap.xml");
const SITE = "https://quiquiz.fr";

function collectLeaves(nodes, parents = [], out = []) {
  for (const node of nodes || []) {
    const trail = [...parents, node.nom].filter(Boolean);
    if (node.fichier) out.push({ ...node, _trail: trail });
    if (node.children) collectLeaves(node.children, trail, out);
  }
  return out;
}

function quizId(leaf) {
  return (
    String(leaf.fichier || "")
      .replace(/^data\//, "")
      .replace(/\.json$/i, "") || leaf.id
  );
}

function quizLabel(leaf) {
  const trail = Array.isArray(leaf._trail) ? leaf._trail : [];
  const name = String(leaf.nom || leaf.id || quizId(leaf)).trim();
  // Ex. Oiseaux › France → « Oiseaux — France »
  if (trail.length >= 2 && name.length <= 24) {
    const parent = trail[trail.length - 2];
    if (parent && parent !== name) return `${parent} — ${name}`;
  }
  return name;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function replaceMarkedBlock(html, begin, end, inner) {
  const start = html.indexOf(begin);
  const stop = html.indexOf(end);
  if (start === -1 || stop === -1 || stop < start) {
    throw new Error(`Marqueurs manquants: ${begin} … ${end}`);
  }
  return (
    html.slice(0, start + begin.length) +
    "\n" +
    inner +
    (inner.endsWith("\n") ? "" : "\n") +
    html.slice(stop)
  );
}

const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
const leaves = collectLeaves(catalog.domains || []).filter((leaf) => !leaf.aVenir);
const lastmod = new Date().toISOString().slice(0, 10);

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE}/</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`;
fs.writeFileSync(sitemapPath, sitemap);

const itemList = {
  "@context": "https://schema.org",
  "@type": "ItemList",
  name: "Quiz QuiQuiz",
  itemListElement: leaves.map((leaf, index) => ({
    "@type": "ListItem",
    position: index + 1,
    name: quizLabel(leaf),
    url: `${SITE}/#/quiz/${encodeURIComponent(quizId(leaf))}`,
    description: leaf.description || undefined,
  })),
};

const itemListJson = JSON.stringify(itemList, null, 2)
  .split("\n")
  .map((line) => `      ${line}`)
  .join("\n")
  .trimStart();

const noscriptList = [
  "        <h2>Quiz disponibles</h2>",
  "        <ul>",
  ...leaves.map(
    (leaf) =>
      `          <li><a href="${SITE}/#/quiz/${encodeURIComponent(quizId(leaf))}">${escapeHtml(quizLabel(leaf))}</a>${
        leaf.description ? ` — ${escapeHtml(leaf.description)}` : ""
      }</li>`,
  ),
  "        </ul>",
].join("\n");

let indexHtml = fs.readFileSync(indexPath, "utf8");
indexHtml = replaceMarkedBlock(
  indexHtml,
  "<!-- SEO_ITEMLIST_BEGIN -->",
  "<!-- SEO_ITEMLIST_END -->",
  `    <script type="application/ld+json">\n${itemListJson}\n    </script>`,
);
indexHtml = replaceMarkedBlock(
  indexHtml,
  "<!-- SEO_NOSCRIPT_QUIZZES_BEGIN -->",
  "<!-- SEO_NOSCRIPT_QUIZZES_END -->",
  noscriptList,
);
fs.writeFileSync(indexPath, indexHtml);

console.log(`sitemap: 1 url (homepage), lastmod ${lastmod}`);
console.log(`seo list: ${leaves.length} quiz synchronisés dans index.html`);
