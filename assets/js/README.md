# JS Modules Overview

This folder contains small ES modules that power the demo pipelines. Each file intentionally isolates one responsibility so the pieces can be mixed in Node or the browser.

- `utils.js` – shared helpers for rendering JSON blocks and safe HTML escaping.
- `logger.js` – lightweight logger used by both pipelines with level filtering and log panel rendering.
- `coordinator.js` – delegated job runner that handles dependency ordering, worker lifecycle states, and duration tracking.
- `auditWorkers.js` – pure worker helpers (DOM-free) for link mapping, accessibility/SEO/performance heuristics, content summaries, and the aggregated report.
- `auditPipeline.js` – browser pipeline wiring: parses HTML input, renders worker outputs, and delegates to the coordinator for concurrency.
- `weatherPipeline.js` – mocked example pipeline used to show multi-stage orchestration without external APIs.
- `main.js` – entry point that wires UI buttons to each pipeline and sample loader.

## Data contracts

The audit pipeline passes structured payloads between workers so they can be reused elsewhere:
- `PageSnapshot` – captured HTML details (title, meta description, canonical, heading list, scripts, styles, links, form controls, body text, word count, and language).
- `LinkMap` – counts of internal/external anchors plus a capped list of the first 25 links.
- `AccessibilityAudit` – issue list derived from snapshot/link data (missing H1, empty headings, missing alt text, etc.).
- `SEOAudit` – issues and notes for title/meta/keyword coverage plus Open Graph presence.
- `PerformanceHints` – script/style counts and blocking/inline heuristics.
- `ContentSummary` – section list built from headings plus text chunks for quick previews.
- `PageReport` – aggregation of all worker outputs with severity counts and rewrite plan suggestions.

These shapes match the expectations in `tests/auditWorkers.mjs` and `tests/auditIntegration.mjs`, so downstream consumers can rely on the same fields.
