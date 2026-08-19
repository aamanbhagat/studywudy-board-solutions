import { createRequire } from "node:module";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require("../node_modules/.pnpm/node_modules/sharp");
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const boardRoot = path.join(repoRoot, "comparison", "after-assets", "images", "boards");
const boardSlugs = ["maharashtra-board", "cbse", "cisce", "tamil-nadu-board"];

await mkdir(boardRoot, { recursive: true });
const generated = await Promise.all(boardSlugs.map(async (slug) => {
  const sourcePath = path.join(boardRoot, `${slug}-v1.png`);
  const outputPath = path.join(boardRoot, `${slug}-v1-card-192.webp`);
  await sharp(sourcePath)
    .rotate()
    .resize({
      width: 192,
      height: 192,
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      withoutEnlargement: true,
    })
    .webp({ quality: 82, effort: 5, smartSubsample: true })
    .toFile(outputPath);
  const info = await stat(outputPath);
  return { slug, bytes: info.size };
}));

console.log(`Prepared ${generated.length} board card images (${generated.reduce((total, item) => total + item.bytes, 0)} bytes).`);
