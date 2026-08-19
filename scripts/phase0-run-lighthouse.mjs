#!/usr/bin/env node

import { existsSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

const origin = (process.env.LIGHTHOUSE_ORIGIN || "https://studywudy-board-solutions.amanbhagat17089.workers.dev").replace(/\/$/, "");
const outputDirectory = process.env.LIGHTHOUSE_OUTPUT_DIRECTORY || "audits/phase-0/lighthouse-json";
const chromeFlags = process.env.LIGHTHOUSE_CHROME_FLAGS || "--headless --no-sandbox --disable-gpu";
const pages = [
  ["homepage", "/"],
  ["board", "/maharashtra-board"],
  ["class", "/maharashtra-board/class-12"],
  ["subject", "/maharashtra-board/class-12/physics"],
  [
    "chapter",
    "/maharashtra-board/class-12/physics/balbharati-physics-standard-12/rotational-dynamics",
  ],
  [
    "question-mcq",
    "/maharashtra-board/class-12/physics/balbharati-physics-standard-12/rotational-dynamics/questions/q-msb-balbharati-physics-standard-12-1-001",
  ],
  [
    "question-numerical",
    "/maharashtra-board/class-12/physics/balbharati-physics-standard-12/rotational-dynamics/questions/q-msb-balbharati-physics-standard-12-1-027",
  ],
  [
    "question-written",
    "/maharashtra-board/class-12/physics/balbharati-physics-standard-12/rotational-dynamics/questions/q-msb-balbharati-physics-standard-12-1-008",
  ],
];

mkdirSync(outputDirectory, { recursive: true });

for (const [pageName, path] of pages) {
  for (const formFactor of ["mobile", "desktop"]) {
    const outputPath = `${outputDirectory}/${pageName}-${formFactor}.json`;
    if (existsSync(outputPath)) {
      console.log(`skip ${pageName} ${formFactor}: ${outputPath} exists`);
      continue;
    }

    console.log(`run ${pageName} ${formFactor}`);
    const args = [
      "dlx",
      "lighthouse@13.4.1",
      `${origin}${path}`,
      "--quiet",
      "--output=json",
      `--output-path=${outputPath}`,
      `--chrome-flags=${chromeFlags}`,
      "--only-categories=performance,accessibility,best-practices,seo",
    ];
    if (formFactor === "desktop") args.push("--preset=desktop");

    const result = spawnSync("pnpm", args, {
      env: {
        ...process.env,
        CHROME_PATH:
          process.env.CHROME_PATH ??
          "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
      },
      stdio: "inherit",
    });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}
