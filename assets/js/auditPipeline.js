import { updateJsonView, escapeHtml } from './utils.js';
import { getAuditLogger } from './logger.js';
import { runDelegatedJob } from './coordinator.js';
import {
  computeLinkMap,
  computeAccessibility,
  computeSeo,
  computePerformance,
  computeContentSummary,
  computeAggregatedReport,
} from './auditWorkers.js';

const SAMPLE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <title>FocusFlow – Productivity for Teams</title>
  <meta name="description" content="A mindful productivity app that keeps teams aligned without notification overload.">
  <link rel="canonical" href="https://focusflow.example.com/">
  <meta property="og:title" content="FocusFlow – Team Productivity" />
</head>
<body>
  <header>
    <h1>FocusFlow</h1>
    <p class="lead">Stay aligned, ship faster, and protect focus time for your team.</p>
    <a href="#cta" class="btn primary">Start your free trial</a>
    <a href="/pricing" class="btn ghost">See pricing</a>
  </header>
  <main>
    <section>
      <h2>Calm collaboration</h2>
      <p>Share updates once, let the team catch up asynchronously, and keep meetings lean.</p>
      <img src="team.png">
    </section>
    <section>
      <h2>Automated status</h2>
      <p>FocusFlow collects tasks, docs, and decisions into a single daily digest.</p>
    </section>
    <section>
      <h3>Integrations</h3>
      <ul>
        <li><a href="https://slack.com">Slack</a></li>
        <li><a href="https://linear.app">Linear</a></li>
        <li><a href="https://notion.so">Notion</a></li>
      </ul>
    </section>
  </main>
  <footer>
    <a href="/accessibility">Accessibility</a>
    <a href="/privacy">Privacy</a>
  </footer>
</body>
</html>`;

export function loadSampleHtml() {
  const textarea = document.getElementById('audit-html');
  if (textarea) {
    textarea.value = SAMPLE_HTML;
  }
}

const workerStateLabel = {
  queued: 'Queued',
  running: 'Running…',
  done: 'Done',
  error: 'Error',
};

function setWorkerRowState(key, state, note = '') {
  const row = document.querySelector(`[data-worker="${key}"]`);
  const stateEl = document.getElementById(`worker-state-${key}`);
  const noteEl = document.getElementById(`worker-note-${key}`);
  if (row) {
    row.setAttribute('data-state', state);
  }
  if (stateEl) {
    stateEl.textContent = workerStateLabel[state] || state;
    stateEl.className = `worker-state pill state-${state}`;
  }
  if (noteEl) {
    noteEl.textContent = note;
  }
}

function resetWorkerBoard(keys = []) {
  keys.forEach((key) => setWorkerRowState(key, 'queued', 'Waiting to start'));
}

function updateWorkerState(key, state, meta = {}) {
  let note = '';
  if (state === 'running') {
    note = 'Running…';
  } else if (state === 'done') {
    const dur = meta.duration_ms != null ? Math.round(meta.duration_ms) : null;
    note = dur ? `Finished in ${dur}ms` : 'Finished';
  } else if (state === 'error') {
    note = meta.error?.message || 'Failed';
  }
  setWorkerRowState(key, state, note);
}

function buildPageSnapshot() {
  const urlInput = document.getElementById('audit-url');
  const htmlInput = document.getElementById('audit-html');
  const keywordInput = document.getElementById('audit-keyword');

  const url = (urlInput?.value || 'https://example.com/demo').trim() || 'https://example.com/demo';
  const focusKeyword = (keywordInput?.value || '').trim();
  const providedHtml = (htmlInput?.value || '').trim();
  const usingSampleHtml = !providedHtml;
  const html = providedHtml || SAMPLE_HTML;

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const lang = doc.documentElement?.getAttribute('lang') || '';

  const textContent = (doc.body?.innerText || '').replace(/\s+/g, ' ').trim();
  const headings = Array.from(doc.querySelectorAll('h1, h2, h3')).map((h) => ({
    tag: h.tagName.toLowerCase(),
    text: (h.textContent || '').trim(),
  }));
  const images = Array.from(doc.querySelectorAll('img')).map((img) => ({
    src: img.getAttribute('src') || '',
    alt: img.getAttribute('alt') || '',
  }));
  const scripts = Array.from(doc.querySelectorAll('script')).map((s) => ({
    src: s.getAttribute('src') || '',
    inline_bytes: (s.textContent || '').length,
    defer: !!s.defer,
    async: !!s.async,
  }));
  const styles = Array.from(doc.querySelectorAll('style')).map((s) => ({
    inline_bytes: (s.textContent || '').length,
  }));

  const formControls = Array.from(doc.querySelectorAll('input, textarea, select, button')).map((el) => {
    const id = el.getAttribute('id') || '';
    const type = el.tagName.toLowerCase() === 'input' ? el.getAttribute('type') || 'text' : el.tagName.toLowerCase();
    const label = id ? doc.querySelector(`label[for="${id}"]`) : el.closest('label');
    const labelText = (label?.textContent || '').trim();
    return {
      tag: el.tagName.toLowerCase(),
      type,
      name: el.getAttribute('name') || '',
      id,
      aria_label: el.getAttribute('aria-label') || '',
      placeholder: el.getAttribute('placeholder') || '',
      label_text: labelText,
    };
  });

  const metaDescription = doc.querySelector('meta[name="description"]')?.getAttribute('content') || '';
  const canonical = doc.querySelector('link[rel="canonical"]')?.getAttribute('href') || '';
  const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute('content') || '';
  const h1 = headings.find((h) => h.tag === 'h1');

  const payload = {
    type: 'PageSnapshot',
    url,
    focus_keyword: focusKeyword,
    using_sample_html: usingSampleHtml,
    title: doc.title || '',
    meta_description: metaDescription,
    canonical,
    open_graph_title: ogTitle,
    h1: h1 ? h1.text : '',
    lang,
    text_content: textContent,
    word_count: textContent.split(/\s+/).filter(Boolean).length,
    headings,
    images,
    scripts,
    styles,
    form_controls: formControls,
    links: Array.from(doc.querySelectorAll('a')).map((a) => ({
      href: a.getAttribute('href') || '',
      text: (a.textContent || '').trim(),
    })),
    meta: { captured_at: Date.now() },
  };

  updateJsonView('audit-snapshot-json', payload);
  return payload;
}

function buildLinkMap(snapshot) {
  const payload = computeLinkMap(snapshot);
  updateJsonView('audit-links-json', payload);
  return payload;
}

function runAccessibilityAudit(snapshot, linkMap) {
  const payload = computeAccessibility(snapshot, linkMap);

  const summaryEl = document.getElementById('audit-accessibility-summary');
  if (summaryEl) {
    if (!payload.issues.length) {
      summaryEl.textContent = 'No critical accessibility issues detected.';
    } else {
      summaryEl.innerHTML = payload.issues
        .slice(0, 5)
        .map((i) => `<span class="pill">${escapeHtml(i.message)}</span>`)
        .join('');
    }
  }

  updateJsonView('audit-accessibility-json', payload);
  return payload;
}

function runSeoAudit(snapshot, focusKeyword) {
  const payload = computeSeo(snapshot, focusKeyword);

  const summaryEl = document.getElementById('audit-seo-summary');
  if (summaryEl) {
    if (!payload.issues.length) {
      summaryEl.textContent = 'No major SEO gaps detected. Titles and meta look healthy.';
    } else {
      const issueText = payload.issues
        .slice(0, 5)
        .map((i) => `• ${i.message}`)
        .join('\n');
      summaryEl.textContent = issueText;
    }
  }

  updateJsonView('audit-seo-json', payload);
  return payload;
}

function runPerformanceHints(snapshot) {
  const payload = computePerformance(snapshot);

  const listEl = document.getElementById('audit-performance-list');
  if (listEl) {
    if (!payload.hints.length) {
      listEl.innerHTML = '<li class="pill">No deterministic performance flags.</li>';
    } else {
      listEl.innerHTML = payload.hints
        .slice(0, 5)
        .map((h) => `<li class="pill">${escapeHtml(h.message)}</li>`)
        .join('');
    }
  }

  updateJsonView('audit-performance-json', payload);
  return payload;
}

function buildContentSummary(snapshot) {
  const payload = computeContentSummary(snapshot);

  const summaryEl = document.getElementById('audit-summary-list');
  if (summaryEl) {
    if (!payload.sections.length) {
      summaryEl.textContent = 'No headings detected; content summary is minimal.';
    } else {
      summaryEl.innerHTML = payload.sections
        .slice(0, 4)
        .map((s) => `<div style="margin-bottom:6px;"><strong>${escapeHtml(s.heading)}</strong><br/><span style="color:var(--text-muted);font-size:0.85rem;">${escapeHtml(s.excerpt)}</span></div>`)
        .join('');
    }
  }

  updateJsonView('audit-summary-json', payload);
  return payload;
}

function buildAggregatedReport(snapshot, linkMap, accessibility, seo, performance, content, focusKeyword) {
  const payload = computeAggregatedReport(snapshot, linkMap, accessibility, seo, performance, content, focusKeyword);

  const planEl = document.getElementById('rewrite-plan-text');
  if (planEl) {
    planEl.innerHTML = `<strong>Suggested title:</strong> ${escapeHtml(payload.rewrite_plan.improved_title)}<br/>` +
      `<strong>Meta description:</strong> ${escapeHtml(payload.rewrite_plan.improved_description)}<br/>` +
      `<strong>CTA focus:</strong> ${escapeHtml(payload.rewrite_plan.hero_cta)}`;
  }

  const checklistEl = document.getElementById('rewrite-checklist');
  if (checklistEl) {
    const checklist = [
      `Fix ${accessibility.issues.length} accessibility issue(s)`,
      `${seo.issues.length ? 'Resolve SEO gaps' : 'SEO looks healthy'}`,
      `${performance.hints.length ? 'Optimize blocking assets' : 'Performance hints are minimal'}`,
      `${linkMap.external} external / ${linkMap.internal} internal links mapped`,
    ];
    checklistEl.innerHTML = checklist
      .map((c) => `<li class="pill">${escapeHtml(c)}</li>`)
      .join('');
  }

  updateJsonView('audit-report-json', payload);
  return payload;
}

export function runAuditPipeline() {
  const logger = getAuditLogger();
  logger.reset();

  const statusEl = document.getElementById('audit-status');
  if (statusEl) {
    statusEl.textContent = 'Running audit pipeline…';
    statusEl.classList.remove('ok', 'error');
  }

  const workers = [
    {
      key: 'snapshot',
      label: 'Snapshot',
      run: () => {
        const snapshot = buildPageSnapshot();
        logger.add('Snapshot', `Captured ${snapshot.word_count} words, ${snapshot.headings.length} headings.`, 'debug');
        if (snapshot.using_sample_html) {
          logger.add('Input', 'Using built-in sample HTML (no pasted markup detected).', 'warn');
        }
        if (!snapshot.focus_keyword) {
          logger.add('SEO', 'No focus keyword provided; keyword coverage check will be light.', 'warn');
        }
        if (snapshot.word_count < 50) {
          logger.add('Content', 'Low word count (<50); some checks may be noisy.', 'warn');
        }
        return snapshot;
      },
    },
    {
      key: 'links',
      label: 'Link map',
      dependsOn: ['snapshot'],
      run: (results) => {
        const linkMap = buildLinkMap(results.snapshot);
        logger.add('Link map', `Mapped ${linkMap.total} links (${linkMap.external} external).`, 'debug');
        return linkMap;
      },
    },
    {
      key: 'accessibility',
      label: 'Accessibility audit',
      dependsOn: ['snapshot', 'links'],
      run: (results) => runAccessibilityAudit(results.snapshot, results.links),
    },
    {
      key: 'seo',
      label: 'SEO audit',
      dependsOn: ['snapshot'],
      run: (results) => runSeoAudit(results.snapshot, results.snapshot.focus_keyword),
    },
    {
      key: 'performance',
      label: 'Performance hints',
      dependsOn: ['snapshot'],
      run: (results) => runPerformanceHints(results.snapshot),
    },
    {
      key: 'content',
      label: 'Content summary',
      dependsOn: ['snapshot'],
      run: (results) => buildContentSummary(results.snapshot),
    },
    {
      key: 'report',
      label: 'Aggregated report',
      dependsOn: ['snapshot', 'links', 'accessibility', 'seo', 'performance', 'content'],
      run: (results) =>
        buildAggregatedReport(
          results.snapshot,
          results.links,
          results.accessibility,
          results.seo,
          results.performance,
          results.content,
          results.snapshot.focus_keyword
        ),
    },
  ];

  resetWorkerBoard(workers.map((w) => w.key));

  runDelegatedJob({
    jobName: 'Audit pipeline',
    workers,
    concurrency: 3,
    onWorkerUpdate: (key, state, meta) => updateWorkerState(key, state, meta),
    onLog: (message, level = 'info', meta = {}) => logger.add('Coordinator', message, level, meta),
  })
    .then(({ results, duration_ms }) => {
      const report = results?.report;
      if (!report) {
        throw new Error('Audit report missing from delegated run');
      }
      logger.add('Pipeline', `Completed with ${report.issues.length} total issue(s).`, 'info', { duration_ms });
      if (statusEl) {
        const { high, medium, low } = report.severity_counts;
        statusEl.textContent = `Audit complete in ${duration_ms}ms. ${high} high, ${medium} medium, ${low} low issues.`;
        statusEl.classList.add('ok');
      }
    })
    .catch((err) => {
      console.error(err);
      logger.add('Pipeline', err.message || 'Unknown error', 'error');
      if (statusEl) {
        statusEl.textContent = 'Error: ' + err.message;
        statusEl.classList.add('error');
      }
    });
}
