const origin = (process.env.PHASE6_GATE_ORIGIN || "http://127.0.0.1:8796").replace(/\/$/, "");
const formFactor = process.env.PHASE6_GATE_FORM_FACTOR === "desktop" ? "desktop" : "mobile";

module.exports = {
  ci: {
    collect: {
      numberOfRuns: 1,
      url: [
        `${origin}/?__sw_lab=1`,
        `${origin}/boards?__sw_lab=1`,
        // The two guided-finder templates. Nothing else in this list is one:
        // after-worker.js:3003 makes isFinderPage true only for /{board} and
        // /{board}/class-N, so before these were added, not one URL under the
        // CLS assertion loaded quick-find.js - the single script that injects a
        // full-height section after hydration. phase6-build-gates.mjs:171-180
        // checks the eight finder templates carry their first-paint reservation
        // string, but nothing measured the CLS that reservation exists to
        // prevent. Keep at least one of each depth here permanently.
        `${origin}/maharashtra-board?__sw_lab=1`,
        `${origin}/maharashtra-board/class-12?__sw_lab=1`,
        `${origin}/maharashtra-board/class-12/biology?stream=science&__sw_lab=1`,
        `${origin}/cbse/class-10/english/cbse-english-literature-reader-class-10/p-10-the-rime-of-the-ancient-mariner/questions/q-cbse-cbse-english-literature-reader-class-10-10-005?__sw_lab=1`,
      ],
      settings: {
        onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
        // One form factor per run, so both are run: homepage-mobile read 0.000
        // CLS while homepage-desktop read 0.202 on identical code. A single
        // form factor proves nothing about a layout shift.
        ...(formFactor === "desktop" ? { preset: "desktop" } : {}),
      },
    },
    assert: {
      assertions: {
        "categories:performance": ["error", { minScore: 0.9 }],
        "categories:accessibility": ["error", { minScore: 0.95 }],
        "categories:best-practices": ["error", { minScore: 0.95 }],
        "categories:seo": ["error", { minScore: 0.95 }],
        // The recovered Worker + local D1 baseline currently lands between
        // 2.6s and 3.2s under Lighthouse's simulated mobile throttling. Keep a
        // hard regression budget while field p75 data uses the 2.5s CWV bar.
        // The desktop run reuses these numbers rather than a tighter invented
        // pair: they are regression ceilings, and there is no desktop baseline
        // to tighten them against yet.
        "largest-contentful-paint": ["error", { maxNumericValue: 3500 }],
        "cumulative-layout-shift": ["error", { maxNumericValue: 0.1 }],
        "total-blocking-time": ["error", { maxNumericValue: 200 }],
      },
    },
    upload: {
      target: "filesystem",
      outputDir: `audits/phase-6/lighthouse/${formFactor}`,
    },
  },
};
