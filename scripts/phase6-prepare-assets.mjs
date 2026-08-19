import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "node_modules/web-vitals/dist/web-vitals.iife.js");
const destination = resolve(root, "comparison/after-assets/monitoring/web-vitals.iife.js");
const sourceMap = `${source}.map`;
const destinationMap = `${destination}.map`;
const appCss = resolve(root, "comparison/after-assets/_next/static/chunks/1j8ahw0e9ui5v.css");

await mkdir(dirname(destination), { recursive: true });
await copyFile(source, destination);
await copyFile(sourceMap, destinationMap);
const css = await readFile(appCss, "utf8");
const stableFontCss = css.replace(/(@font-face\{font-family:"IBM Plex Sans"[^}]*font-display:)optional/g, "$1swap");
if (stableFontCss !== css) await writeFile(appCss, stableFontCss);
console.log(`Prepared ${destination.replace(`${root}/`, "")} from web-vitals 6.1.1.`);
