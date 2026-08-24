#!/usr/bin/env node

import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
const scriptPath = resolve(root, ".wrangler/dry-run-after/after-worker.js");
const persistencePath = resolve(root, "comparison/after-persistence/v3");
const port = Number(process.env.STUDYWUDY_PREVIEW_PORT || 8789);
const pnpmStore = resolve(root, "node_modules/.pnpm");
const miniflarePackage = readdirSync(pnpmStore)
  .filter((entry) => entry.startsWith("miniflare@"))
  .sort()
  .at(-1);
if (!miniflarePackage) throw new Error("Miniflare is missing. Run: pnpm install");
const {
  convertV4MiniflareOptions,
  kCurrentWorker,
  Miniflare,
} = await import(pathToFileURL(resolve(pnpmStore, miniflarePackage, "node_modules/miniflare/dist/src/index.js")));

if (!existsSync(scriptPath)) {
  throw new Error(`Fresh Worker bundle is missing: ${scriptPath}\nRun: pnpm check:after`);
}

const workerFirst = [
  "/", "/boards", "/search*", "/maharashtra-board*", "/cbse*", "/cisce*",
  "/tamil-nadu-board*", "/robots.txt", "/ads.txt", "/sitemap.xml", "/sitemaps/*",
  "/__studywudy_payloads/*", "/studywudy-media/*", "/boardly-media/*", "/about",
  "/about/*", "/privacy", "/terms", "/contact", "/api/monitoring/*",
];

const options = convertV4MiniflareOptions({
  host: "127.0.0.1",
  port,
  scriptPath,
  modules: true,
  compatibilityDate: "2026-08-17",
  compatibilityFlags: ["nodejs_compat", "global_fetch_strictly_public"],
  cacheAPI: false,
  bindings: {
    NEXT_INC_CACHE_R2_PREFIX: "incremental-cache-v20",
    PHASE6_CRAWL_ORIGIN: "https://studywudy-board-solutions.amanbhagat17089.workers.dev",
    PHASE6_CRAWL_SITEMAP: "https://studywudy-board-solutions.amanbhagat17089.workers.dev/sitemap.xml",
  },
  assets: {
    directory: resolve(root, "comparison/after-assets"),
    binding: "ASSETS",
    run_worker_first: workerFirst,
    routerConfig: { has_user_worker: true, invoke_user_worker_ahead_of_assets: true },
  },
  d1Databases: { DB: "33c51af4-a780-41c9-8294-738365dca1de" },
  r2Buckets: {
    MEDIA: "studywudy-media",
    NEXT_INC_CACHE_R2_BUCKET: "studywudy-media",
  },
  durableObjects: {
    NEXT_CACHE_DO_QUEUE: { className: "DOQueueHandler", useSQLite: true },
  },
  serviceBindings: { WORKER_SELF_REFERENCE: kCurrentWorker },
  queueProducers: { CRAWL_QUEUE: "studywudy-weekly-crawl" },
  resourcePersistencePath: persistencePath,
});

const miniflare = new Miniflare(options);
const ready = await miniflare.ready;
process.stdout.write(`StudyWudy current preview: ${ready}\n`);

const close = async () => {
  await miniflare.dispose();
  process.exit(0);
};
process.once("SIGINT", close);
process.once("SIGTERM", close);
await new Promise(() => {});
