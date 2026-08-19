const origin = (process.env.PHASE6_GATE_ORIGIN || "http://127.0.0.1:8796").replace(/\/$/, "");

module.exports = {
  ci: {
    collect: {
      numberOfRuns: 1,
      url: [
        `${origin}/?__sw_lab=1`,
        `${origin}/boards?__sw_lab=1`,
        `${origin}/maharashtra-board/class-12/biology?stream=science&__sw_lab=1`,
        `${origin}/cbse/class-10/english/cbse-english-literature-reader-class-10/p-10-the-rime-of-the-ancient-mariner/questions/q-cbse-cbse-english-literature-reader-class-10-10-005?__sw_lab=1`,
      ],
      settings: {
        onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
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
        "largest-contentful-paint": ["error", { maxNumericValue: 3500 }],
        "cumulative-layout-shift": ["error", { maxNumericValue: 0.1 }],
        "total-blocking-time": ["error", { maxNumericValue: 200 }],
      },
    },
    upload: {
      target: "filesystem",
      outputDir: "audits/phase-6/lighthouse",
    },
  },
};
