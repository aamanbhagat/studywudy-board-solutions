#!/usr/bin/env node

const sitemapUrl =
  process.argv[2] ??
  "https://studywudy-board-solutions.amanbhagat17089.workers.dev/sitemap.xml";

const fetchXml = async (url) => {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${url}`);
  }
  return response.text();
};

const locs = (xml) =>
  [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);

const indexXml = await fetchXml(sitemapUrl);
const childSitemaps = locs(indexXml);
const batches = [];

for (let offset = 0; offset < childSitemaps.length; offset += 8) {
  const batch = childSitemaps.slice(offset, offset + 8);
  batches.push(...(await Promise.all(batch.map(fetchXml))));
}

const urls = batches.flatMap(locs);
const counts = {
  question: 0,
  chapter: 0,
  subject: 0,
  class: 0,
  board: 0,
  book: 0,
  stream: 0,
  program: 0,
  homepage: 0,
  other: 0,
};
const examples = {};
const otherUrls = [];
const excludedTopLevel = new Set([
  "about",
  "boards",
  "contact",
  "privacy",
  "search",
  "terms",
]);

for (const rawUrl of urls) {
  const { pathname } = new URL(rawUrl);
  const segments = pathname.split("/").filter(Boolean);
  let template = "other";

  if (pathname === "/") template = "homepage";
  else if (segments.includes("questions")) template = "question";
  else if (segments[2] === "streams" && segments.length === 6) {
    template = "subject";
  } else if (segments[2] === "streams" && segments.length === 5) {
    template = "program";
  } else if (segments[2] === "streams" && segments.length === 4) {
    template = "stream";
  }
  else if (segments.length === 5) template = "chapter";
  else if (segments.length === 4) template = "book";
  else if (segments.length === 3 && segments[1].startsWith("class-")) {
    template = "subject";
  } else if (segments.length === 2 && segments[1].startsWith("class-")) {
    template = "class";
  } else if (segments.length === 1 && !excludedTopLevel.has(segments[0])) {
    template = "board";
  }

  counts[template] += 1;
  examples[template] ??= rawUrl;
  if (template === "other") otherUrls.push(rawUrl);
}

const uniqueUrls = new Set(urls);
console.log(
  JSON.stringify(
    {
      auditedAt: new Date().toISOString(),
      sitemapUrl,
      childSitemapCount: childSitemaps.length,
      totalUrls: urls.length,
      uniqueUrls: uniqueUrls.size,
      duplicateUrls: urls.length - uniqueUrls.size,
      counts,
      examples,
      otherUrls,
    },
    null,
    2,
  ),
);
