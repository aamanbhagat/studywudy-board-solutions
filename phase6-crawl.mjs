const RECURRING_CRAWL_CRON = "17 2 * * *";
const DEFAULT_CRAWL_ORIGIN = "https://studywudy-board-solutions.amanbhagat17089.workers.dev";
const DEFAULT_SITEMAP_PATH = "/sitemap.xml";
const MAX_SITEMAP_BYTES = 16 * 1024 * 1024;
const MAX_PAGE_HTML_BYTES = 2 * 1024 * 1024;
const MAX_LINKS_PER_PAGE = 500;
const SEND_BATCH_SIZE = 100;
// Cloudflare Queues' free-plan daily write allowance is smaller than the full
// 300K+ URL corpus. Crawl one stable partition per day so each run stays below
// the allowance while the complete indexable corpus rotates every 48 days.
const CRAWL_SHARD_COUNT = 48;
const CRAWLER_USER_AGENT = `StudyWudy-Recurring-Crawl/2.0 (+${DEFAULT_CRAWL_ORIGIN}/contact)`;
const NON_PAGE_PATH = /(?:^\/_next\/|^\/api\/|^\/monitoring\/|\.(?:avif|css|csv|docx?|gif|ico|jpe?g|js|json|map|mp3|mp4|pdf|png|svg|txt|webm|webp|woff2?|xml|zip)$)/i;

function crawlOrigin(environment) {
  const configured = String(environment.PHASE6_CRAWL_ORIGIN || DEFAULT_CRAWL_ORIGIN).replace(/\/$/, "");
  const parsed = new URL(configured);
  if (parsed.protocol !== "https:") throw new Error("PHASE6_CRAWL_ORIGIN must use HTTPS");
  return parsed.origin;
}

function sitemapUrl(environment) {
  const origin = crawlOrigin(environment);
  const configured = String(environment.PHASE6_CRAWL_SITEMAP || `${origin}${DEFAULT_SITEMAP_PATH}`);
  const parsed = new URL(configured);
  if (parsed.origin !== origin) throw new Error("The crawl sitemap must use PHASE6_CRAWL_ORIGIN");
  return parsed.toString();
}

function safeCrawlUrl(value, environment) {
  try {
    const url = new URL(String(value));
    return url.origin === crawlOrigin(environment) && url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function safePageUrl(value, baseUrl, environment) {
  try {
    const url = new URL(String(value), baseUrl);
    if (url.origin !== crawlOrigin(environment) || url.protocol !== "https:" || NON_PAGE_PATH.test(url.pathname)) return null;
    url.hash = "";
    for (const name of [...url.searchParams.keys()]) {
      if (/^(?:utm_|fbclid$|gclid$|msclkid$)/i.test(name)) url.searchParams.delete(name);
    }
    return url;
  } catch {
    return null;
  }
}

function xmlDecode(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

function sitemapLocations(xml) {
  return [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((match) => xmlDecode(match[1].trim()));
}

function stableHash(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function crawlShard(runId) {
  const date = Date.parse(`${runId}T00:00:00.000Z`);
  return Math.floor(date / 86_400_000) % CRAWL_SHARD_COUNT;
}

function belongsToRunShard(url, runId) {
  return stableHash(url) % CRAWL_SHARD_COUNT === crawlShard(runId);
}

async function boundedBytes(response, maximum = MAX_SITEMAP_BYTES, label = "Sitemap") {
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > maximum) throw new Error(`${label} exceeds the crawl safety limit`);
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximum) {
      await reader.cancel();
      throw new Error(`${label} exceeds the crawl safety limit`);
    }
    chunks.push(value);
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

async function sitemapText(response) {
  const bytes = await boundedBytes(response, MAX_SITEMAP_BYTES, "Sitemap");
  const isGzip = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  if (!isGzip) return new TextDecoder().decode(bytes);
  const decompressed = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(decompressed).text();
}

function pageLinks(html, pageUrl, environment) {
  const links = new Set();
  const matcher = /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  for (const match of html.matchAll(matcher)) {
    const raw = xmlDecode(match[1] ?? match[2] ?? match[3] ?? "").trim();
    if (!raw || raw.startsWith("#") || /^(?:mailto|tel|javascript|data):/i.test(raw)) continue;
    const url = safePageUrl(raw, pageUrl, environment);
    if (url) links.add(url.toString());
    if (links.size >= MAX_LINKS_PER_PAGE) break;
  }
  return [...links];
}

async function fetchSitemap(url) {
  const response = await fetch(url, {
    headers: { accept: "application/xml,text/xml;q=0.9,*/*;q=0.1", "user-agent": CRAWLER_USER_AGENT },
    redirect: "follow",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Sitemap returned HTTP ${response.status}`);
  const xml = await sitemapText(response);
  if (!/<(?:sitemapindex|urlset)\b/i.test(xml)) throw new Error("Response is not a sitemap index or URL set");
  return { xml, locations: sitemapLocations(xml), isIndex: /<sitemapindex\b/i.test(xml) };
}

async function sendBatches(queue, bodies) {
  for (let index = 0; index < bodies.length; index += SEND_BATCH_SIZE) {
    await queue.sendBatch(bodies.slice(index, index + SEND_BATCH_SIZE).map((body) => ({ body, contentType: "json" })));
  }
}

async function insertNewTargets(environment, runId, sourceUrl, urls) {
  const unique = [...new Set(urls)];
  const inserted = [];
  const now = Math.floor(Date.now() / 1000);
  for (let index = 0; index < unique.length; index += SEND_BATCH_SIZE) {
    const chunk = unique.slice(index, index + SEND_BATCH_SIZE);
    const results = await environment.DB.batch(chunk.map((url) => environment.DB.prepare(`INSERT OR IGNORE INTO phase6_crawl_targets
      (run_id, url, first_source_url, discovered_at) VALUES (?, ?, ?, ?)`)
      .bind(runId, url.slice(0, 2_048), sourceUrl.slice(0, 2_048), now)));
    results.forEach((result, resultIndex) => {
      if (Number(result.meta?.changes || 0) > 0) inserted.push(chunk[resultIndex]);
    });
  }
  return inserted;
}

async function maybeCompleteRun(environment, runId) {
  const now = Math.floor(Date.now() / 1000);
  await environment.DB.prepare(`UPDATE phase6_crawl_runs SET
    status = 'complete', completed_at = COALESCE(completed_at, ?)
    WHERE run_id = ? AND sitemaps_processed >= sitemap_count AND urls_checked >= url_count`)
    .bind(now, runId).run();
}

async function markUrlChecked(environment, runId) {
  await environment.DB.prepare("UPDATE phase6_crawl_runs SET urls_checked = urls_checked + 1 WHERE run_id = ?")
    .bind(runId).run();
  await maybeCompleteRun(environment, runId);
}

async function recordIssue(environment, message, issueType, status, detail) {
  const now = Math.floor(Date.now() / 1000);
  await environment.DB.batch([
    environment.DB.prepare(`INSERT INTO phase6_crawl_issues
      (run_id, url, source_url, issue_type, http_status, detail, checked_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(run_id, url) DO UPDATE SET
        source_url = excluded.source_url,
        issue_type = excluded.issue_type,
        http_status = excluded.http_status,
        detail = excluded.detail,
        checked_at = excluded.checked_at`)
      .bind(message.runId, String(message.url).slice(0, 2_048), String(message.sourceUrl || message.url).slice(0, 2_048), issueType, status, String(detail || "").slice(0, 500), now),
    environment.DB.prepare("UPDATE phase6_crawl_runs SET issue_count = issue_count + 1 WHERE run_id = ?")
      .bind(message.runId),
  ]);
}

async function processSitemapMessage(body, environment) {
  const safeUrl = safeCrawlUrl(body.url, environment);
  if (!safeUrl) {
    await recordIssue(environment, body, "invalid-url", null, "Sitemap URL is outside the configured production origin");
    return;
  }
  const parsed = await fetchSitemap(safeUrl.toString());
  if (body.kind === "sitemap-index" && !parsed.isIndex) throw new Error("Expected a sitemap index");
  const valid = [];
  for (const location of parsed.locations) {
    const url = safeCrawlUrl(location, environment);
    if (url) valid.push(url.toString());
    else await recordIssue(environment, { ...body, url: location, sourceUrl: safeUrl.toString() }, "invalid-url", null, "Sitemap entry is outside the configured production origin");
  }
  if (parsed.isIndex) {
    await sendBatches(environment.CRAWL_QUEUE, valid.map((url) => ({ kind: "sitemap", runId: body.runId, url, sourceUrl: safeUrl.toString() })));
    await environment.DB.prepare(`UPDATE phase6_crawl_runs
      SET status = 'running', sitemap_count = sitemap_count + ? WHERE run_id = ?`)
      .bind(valid.length, body.runId).run();
  } else {
    const shardUrls = valid.filter((url) => belongsToRunShard(url, body.runId));
    const inserted = await insertNewTargets(environment, body.runId, safeUrl.toString(), shardUrls);
    await environment.DB.prepare(`UPDATE phase6_crawl_runs
      SET status = 'running', sitemaps_processed = sitemaps_processed + 1, url_count = url_count + ? WHERE run_id = ?`)
      .bind(inserted.length, body.runId).run();
    await sendBatches(environment.CRAWL_QUEUE, inserted.map((url) => ({ kind: "page", runId: body.runId, url, sourceUrl: safeUrl.toString() })));
    await maybeCompleteRun(environment, body.runId);
  }
}

async function processPageMessage(body, environment) {
  const safeUrl = safeCrawlUrl(body.url, environment);
  if (!safeUrl) {
    await recordIssue(environment, body, "invalid-url", null, "Page URL is outside the configured production origin");
    return;
  }
  const response = await fetch(safeUrl.toString(), {
    headers: { accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1", "user-agent": CRAWLER_USER_AGENT },
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status >= 300 && response.status < 400) {
    if (response.body) await response.body.cancel();
    await recordIssue(environment, body, "redirect", response.status, response.headers.get("location") || "Redirect without Location header");
  } else if (!response.ok) {
    if (response.body) await response.body.cancel();
    await recordIssue(environment, body, "http", response.status, response.statusText || `HTTP ${response.status}`);
  } else if ((response.headers.get("content-type") || "").toLowerCase().includes("text/html")) {
    // Consume and bound HTML so oversized/error responses are still caught.
    // Link discovery is intentionally performed by the separate independent
    // link audit: recursively queueing every link would exceed the Queue write
    // allowance before a production run could complete.
    await boundedBytes(response, MAX_PAGE_HTML_BYTES, "HTML page");
  } else if (response.body) {
    await response.body.cancel();
  }
  await markUrlChecked(environment, body.runId);
}

function validMessage(body) {
  return body && typeof body === "object"
    && ["sitemap-index", "sitemap", "page"].includes(body.kind)
    && /^\d{4}-\d{2}-\d{2}$/.test(String(body.runId || ""))
    && typeof body.url === "string";
}

export async function schedulePhase6WeeklyCrawl(controller, environment) {
  if (controller.cron !== RECURRING_CRAWL_CRON) return { scheduled: false };
  if (!environment.DB || !environment.CRAWL_QUEUE) throw new Error("Phase 6 crawl bindings are unavailable");
  const scheduledAt = Number(controller.scheduledTime || Date.now());
  const runId = new Date(scheduledAt).toISOString().slice(0, 10);
  const source = sitemapUrl(environment);
  const result = await environment.DB.prepare(`INSERT OR IGNORE INTO phase6_crawl_runs
    (run_id, sitemap_url, started_at, status) VALUES (?, ?, ?, 'queued')`)
    .bind(runId, source, Math.floor(scheduledAt / 1000)).run();
  if (Number(result.meta?.changes || 0) > 0) {
    await environment.CRAWL_QUEUE.send({ kind: "sitemap-index", runId, url: source, sourceUrl: source }, { contentType: "json" });
  }
  return { scheduled: Number(result.meta?.changes || 0) > 0, runId, sitemap: source };
}

export async function handlePhase6CrawlBatch(batch, environment) {
  for (const message of batch.messages) {
    const body = message.body;
    if (!validMessage(body)) {
      message.ack();
      continue;
    }
    try {
      if (body.kind === "page") await processPageMessage(body, environment);
      else await processSitemapMessage(body, environment);
      message.ack();
    } catch (error) {
      if (message.attempts < 3) {
        message.retry({ delaySeconds: Math.min(900, 30 * (2 ** message.attempts)) });
      } else {
        await recordIssue(environment, body, body.kind === "page" ? "network" : "invalid-sitemap", null, error instanceof Error ? error.message : String(error));
        if (body.kind === "page") await markUrlChecked(environment, body.runId);
        message.ack();
      }
    }
  }
}

export const PHASE6_CRAWL = Object.freeze({
  cron: RECURRING_CRAWL_CRON,
  defaultOrigin: DEFAULT_CRAWL_ORIGIN,
  defaultSitemap: `${DEFAULT_CRAWL_ORIGIN}${DEFAULT_SITEMAP_PATH}`,
  consumerBatchSize: 5,
  maxConsumerConcurrency: 1,
  maxLinksPerPage: MAX_LINKS_PER_PAGE,
  shardCount: CRAWL_SHARD_COUNT,
  fullCoverageDays: CRAWL_SHARD_COUNT,
});
