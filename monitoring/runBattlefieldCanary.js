const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require('playwright');

const CONFIG = {
  targetUrl: process.env.TARGET_URL || 'https://www.battlefield.com/',
  outputRoot: path.join(__dirname, 'runs'),
  runId: (process.env.RUN_ID || new Date().toISOString().replace(/[-:]/g, '').split('.')[0]).replace(/[^a-zA-Z0-9._-]/g, ''),
  settleMs: Number(process.env.SETTLE_MS || 5000),
  navTimeoutMs: Number(process.env.NAV_TIMEOUT_MS || 120000),
  waitUntil: process.env.WAIT_UNTIL || 'networkidle',
  headless: process.env.HEADLESS !== 'false',
  userAgent:
    process.env.USER_AGENT || 'battlefield-canary/0.2 (+https://www.battlefield.com; monitoring capture)',
  maxInlinePreview: Number(process.env.MAX_INLINE_PREVIEW || 4000)
};

const RUN_DIR = path.join(CONFIG.outputRoot, CONFIG.runId);

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function writeJson(outPath, data) {
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2), 'utf8');
}

function toHash(text) {
  return require('crypto').createHash('sha256').update(text).digest('hex').slice(0, 12);
}

async function capture() {
  ensureDir(CONFIG.outputRoot);
  ensureDir(RUN_DIR);

  const runMeta = {
    runId: CONFIG.runId,
    targetUrl: CONFIG.targetUrl,
    startedAt: new Date().toISOString(),
    timings: {},
    counts: {}
  };

  const browser = await chromium.launch({ headless: CONFIG.headless });
  try {
    const context = await browser.newContext({
      recordHar: { path: path.join(RUN_DIR, 'session.har'), content: 'embed', mode: 'minimal' },
      userAgent: CONFIG.userAgent
    });

    const page = await context.newPage();
    const apiEvents = [];
    const consoleLogs = [];
    const resourceSummary = { byType: {}, byHost: {} };

    page.on('console', (msg) => {
      const args = msg.args();
      const text = args.length ? args.map((arg) => arg.toString()).join(' ') : msg.text();
      consoleLogs.push(`[${msg.type()}] ${text}`);
    });

    context.on('response', (response) => {
      const resourceType = response.request().resourceType();
      resourceSummary.byType[resourceType] = (resourceSummary.byType[resourceType] || 0) + 1;
      try {
        const host = new URL(response.url()).hostname;
        resourceSummary.byHost[host] = (resourceSummary.byHost[host] || 0) + 1;
      } catch (err) {
        // ignore malformed URLs
      }
    });

    context.on('response', async (response) => {
      const url = response.url();
      const headers = response.headers();
      const contentType = headers['content-type'] || '';
      const isJson = contentType.includes('application/json');
      const looksApi = isJson || url.includes('/graphql') || url.includes('/api/') || url.includes('cms');

      if (!looksApi) return;

      try {
        const bodyBuffer = await response.body();
        const bodyText = bodyBuffer.toString('utf8');
        const parsed = isJson ? JSON.parse(bodyText) : bodyText;
        apiEvents.push({
          url,
          status: response.status(),
          headers,
          body: parsed
        });
      } catch (error) {
        apiEvents.push({ url, status: response.status(), headers, error: error.message });
      }
    });

    const navStart = Date.now();
    await page.goto(CONFIG.targetUrl, { waitUntil: CONFIG.waitUntil, timeout: CONFIG.navTimeoutMs });
    await page.waitForTimeout(CONFIG.settleMs);
    runMeta.timings.navigateMs = Date.now() - navStart;
    runMeta.timings.settleMs = CONFIG.settleMs;

    const dom = await page.content();
    fs.writeFileSync(path.join(RUN_DIR, 'dom.html'), dom, 'utf8');

    const headerResponse = await context.request.get(CONFIG.targetUrl);
    writeJson(path.join(RUN_DIR, 'top-level-headers.json'), headerResponse.headers());

    const scriptInventory = await page.$$eval('script', (nodes) =>
      nodes.map((node) => ({
        src: node.src || null,
        type: node.type || null,
        inlinePreview: node.src ? null : (node.textContent || '')
      }))
    );
    // Fill hashes outside the page context
    scriptInventory.forEach((script) => {
      if (!script.src && script.inlinePreview) {
        const trimmed = script.inlinePreview.slice(0, CONFIG.maxInlinePreview);
        script.inlinePreview = trimmed;
        script.inlineHash = toHash(trimmed);
      }
    });
    writeJson(path.join(RUN_DIR, 'scripts.json'), scriptInventory);
    runMeta.counts.scripts = scriptInventory.length;

    const techHints = await page.evaluate(() => ({
      nextData: typeof window.__NEXT_DATA__ !== 'undefined' ? window.__NEXT_DATA__ : null,
      react: typeof window.React !== 'undefined' ? { version: window.React.version } : null,
      webpack: typeof window.webpackJsonp !== 'undefined' || typeof window.webpackChunkbuild !== 'undefined',
      tailwind: document.querySelector('style[data-tailwind]') ? true : false,
      thirdPartyScripts: Array.from(document.querySelectorAll('script[src]')).map((el) => el.src)
    }));
    writeJson(path.join(RUN_DIR, 'tech-hints.json'), techHints);

    writeJson(path.join(RUN_DIR, 'api-events.json'), apiEvents);
    runMeta.counts.apiEvents = apiEvents.length;

    fs.writeFileSync(path.join(RUN_DIR, 'console.log'), consoleLogs.join('\n'), 'utf8');
    writeJson(path.join(RUN_DIR, 'resource-summary.json'), resourceSummary);

    await page.screenshot({ path: path.join(RUN_DIR, 'page.png'), fullPage: true });

    runMeta.completedAt = new Date().toISOString();

    const priorRuns = fs
      .readdirSync(CONFIG.outputRoot)
      .filter((run) => run !== CONFIG.runId)
      .filter((run) => fs.statSync(path.join(CONFIG.outputRoot, run)).isDirectory())
      .sort();

    if (priorRuns.length) {
      const previous = path.join(CONFIG.outputRoot, priorRuns[priorRuns.length - 1]);
      const diffPath = path.join(RUN_DIR, 'diff.md');
      const diff = execSync(`git diff --no-index -- ${previous} ${RUN_DIR} || true`, { encoding: 'utf8' });
      fs.writeFileSync(diffPath, `# Canary diff vs ${path.basename(previous)}\n\n\n\`\`\`diff\n${diff}\n\`\`\`\n`, 'utf8');
      runMeta.previousRun = path.basename(previous);
      runMeta.diff = path.basename(diffPath);
    }

    writeJson(path.join(RUN_DIR, 'run-summary.json'), runMeta);
  } catch (error) {
    runMeta.error = error.message;
    writeJson(path.join(RUN_DIR, 'run-summary.json'), runMeta);
    throw error;
  } finally {
    await browser.close();
  }
}

capture().catch((error) => {
  console.error('Canary run failed:', error);
  process.exitCode = 1;
});
