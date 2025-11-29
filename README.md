# AI Modular Pipeline Demo

This repo hosts a browser-first demo that showcases two modular pipelines (a mocked weather pipeline and a webpage audit pipeline) plus a Playwright-based canary for battlefield.com monitoring. The code is split into small ES modules so individual workers can be reused in browser or Node contexts.

## Quickstart: Browser Demo
1. Start a static server from the repo root: `npm run demo` (or any equivalent static server).
2. Open `http://127.0.0.1:8000/ai_modular_pipeline_demo.html`.
3. Run either pipeline:
   - **Weather (mocked):** enter a location and units, then run to see the end-to-end node outputs.
   - **Webpage audit:** provide a target URL, focus keyword, and HTML (or load the sample). Review the delegation board, worker outputs, and final report.

## Automated Tests (Node)
Run the Node-based self-tests to validate the modular workers and delegation scheduler:

```bash
npm test
# or individually
node tests/auditWorkers.mjs
node tests/delegationRunner.mjs
node tests/auditIntegration.mjs
```

## Battlefield.com Canary (Playwright)
Inside `monitoring/` you will find a Playwright script that captures HAR, DOM, headers, scripts, and API payloads, then diffs against the previous run. To use it:

```bash
cd monitoring
npm install
node runBattlefieldCanary.js
```

> Note: Playwright binaries may require internet access to install. If installation fails, retry in an environment with registry access.

## Repo Layout
- `ai_modular_pipeline_demo.html` – single-page UI wiring the pipelines together.
- `assets/js` – modular pipeline code (helpers, logger, coordinator, weather/audit workers).
- `assets/styles` – shared styling for the demo and delegation board.
- `tests` – Node self-tests for workers, delegation scheduler, and integrated audit pipeline.
- `monitoring` – Playwright-based battlefield.com canary and its package manifest.
