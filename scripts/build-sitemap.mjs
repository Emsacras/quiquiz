/**
 * Génère public/sitemap.xml à partir du catalogue.
 * Usage: node scripts/build-sitemap.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const catalog = JSON.parse(fs.readFileSync(path.join(root, "public/data/catalog.json"), "utf8"));
const SITE = "https://quiquiz.fr";

function collectLeaves(nodes, out = []) {
  for (const node of nodes || []) {
    if (node.fichier) out.push(node);
    if (node.children) collectLeaves(node.children, out);
  }
  return out;
}

const leaves = collectLeaves(catalog.domains || []);
const urls = [
  { loc: `${SITE}/`, changefreq: "weekly", priority: "1.0" },
  ...leaves.map((leaf) => {
    const id = String(leaf.fichier || "")
      .replace(/^data\//, "")
      .replace(/\.json$/i, "") || leaf.id;
    return {
      loc: `${SITE}/#/quiz/${encodeURIComponent(id)}`,
      changefreq: "monthly",
      priority: "0.7",
    };
  }),
];

const body = urls
  .map(
    (u) => `  <url>
    <loc>${u.loc}</loc>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`,
  )
  .join("\n");

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;

fs.writeFileSync(path.join(root, "public/sitemap.xml"), xml);
console.log(`sitemap: ${urls.length} urls`);
