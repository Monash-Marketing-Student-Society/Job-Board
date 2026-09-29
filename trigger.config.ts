import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  project: "proj_pbqlqqjvscrkddidnnut",
  runtime: "node-24",
  logLevel: "log",
  // The max compute seconds a task is allowed to run. If the task run exceeds this duration, it will be stopped.
  // You can override this on an individual task.
  // See https://trigger.dev/docs/runs/max-duration
  maxDuration: 3600,
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
      randomize: true,
    },
  },
  dirs: ["./src/trigger"],
  build: {
    // Installed as real packages in the deploy image, not inlined into the
    // bundle. jsdom (via isomorphic-dompurify, which lib/sanitize.ts uses to
    // clean synced job descriptions) reads its own CSS file from its package
    // directory at import time; inlined, that path doesn't exist and every
    // task fails to load ("ENOENT ... browser/default-stylesheet.css").
    // `deploy --dry-run` only bundles, never imports, so it can't catch this.
    external: ["isomorphic-dompurify", "jsdom"],
  },
});
