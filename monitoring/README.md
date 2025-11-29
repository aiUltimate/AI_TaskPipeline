# Battlefield.com Canary Monitor

This folder contains a runnable Node + Playwright canary that snapshots https://www.battlefield.com every four hours and diffs the results against the previous run. The goal is to immediately flag any meaningful change to the public site: frontend stack shifts (React/Next.js/Tailwind), third-party script churn, JSON/GraphQL endpoint changes for news/carousel feeds, and CDN/header fingerprints.

## What the canary captures
- **HAR** for the full navigation (network requests and timing) saved as `session.har`.
- **DOM snapshot** as `dom.html` after the page settles.
- **Top-level response headers** for the landing request.
- **Script inventory** including external URLs, trimmed inline previews, and SHA-256 hashes to spot Next.js/React/Tailwind drift.
- **Tech hints** scraped from the page (e.g., `__NEXT_DATA__`, React version when present, webpack globals).
- **API payloads** for any JSON/GraphQL responses observed during the browse, including status, headers, and response bodies.
- **Console log + resource summary** to catch client-side errors and host/resource mix changes.
- **Full-page screenshot** to visually confirm layout and hero/carousel content.
- **Run summary** with timings, counts, prior-run reference, and error capture if anything fails mid-run.
- **Diff report** versus the prior run (`diff.md`) generated with `git diff --no-index` so even a single field change is surfaced.

## Quickstart
1. Install dependencies inside this folder (Playwright will download its browsers):
   ```bash
   cd monitoring
   npm install
   ```
2. Run a single capture:
   ```bash
   node runBattlefieldCanary.js
   ```
   Output is stored under `monitoring/runs/<timestamp>/`.
3. Inspect the diff report inside the latest run directory. If this is the second run or later, `diff.md` will contain the full change set versus the prior run.

## Scheduling (every 4 hours)
- Cron example (runs at minute 5 every 4th hour, assumes repo at `/srv/bf-canary`):
  ```cron
  5 */4 * * * cd /srv/bf-canary/monitoring && npm install --silent && node runBattlefieldCanary.js >> cron.log 2>&1
  ```
- Systemd timer or a lightweight GitHub Actions workflow can call the same script. The `runs/` directory is intentionally left unignored so each run can be committed for traceability.

## Slack/Discord hooks
- Add a tiny wrapper (e.g., `post-run-hook.sh`) that checks for a non-empty `diff.md` and posts it to your webhook. The core canary script only writes files; it never auto-updates baselines.

## Notes
- Baseline is whatever is present in the first run. To lock “Nov 29, 2025” as the baseline, run the script once with that date in the run ID via `RUN_ID=20251129T0000 node runBattlefieldCanary.js`.
- The script favors determinism: headless Chromium, waits for `networkidle`, then an extra settle (default 5s, configurable via `SETTLE_MS`) before capturing.
- If EA moves key endpoints behind auth, add credentials or cookies via the Playwright context configuration in `runBattlefieldCanary.js`.
- Config knobs (all optional):
  - `TARGET_URL` (default `https://www.battlefield.com/`)
  - `RUN_ID` (defaults to ISO timestamp, sanitized for filesystem safety)
  - `WAIT_UNTIL` (default `networkidle`)
  - `NAV_TIMEOUT_MS` (default `120000`)
  - `SETTLE_MS` (default `5000`)
  - `USER_AGENT` (defaults to `battlefield-canary/0.2 ...`)
  - `HEADLESS` (`false` to watch the run)
  - `MAX_INLINE_PREVIEW` (default `4000` characters of inline script retained for hashing)
