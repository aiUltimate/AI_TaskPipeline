import { escapeHtml } from './utils.js';

function createAuditLogger() {
  const entries = [];
  const logEl = document.getElementById('audit-log');

  function render() {
    if (!logEl) return;
    if (!entries.length) {
      logEl.textContent = 'Run the audit to see step-by-step logs.';
      logEl.classList.add('empty');
      return;
    }

    logEl.classList.remove('empty');
    logEl.innerHTML = entries
      .slice(-14)
      .map((entry) => {
        const when = new Date(entry.ts).toLocaleTimeString();
        const duration = entry.meta?.duration_ms ? ` · ${Math.round(entry.meta.duration_ms)}ms` : '';
        return `<div class="log-entry level-${entry.level}">` +
          `<span class="log-dot"></span>` +
          `<div><strong>${escapeHtml(entry.stage)}</strong> — ${escapeHtml(entry.message)}` +
          `<div class="log-meta">${escapeHtml(when)}${duration}</div></div>` +
          `</div>`;
      })
      .join('');
  }

  function add(stage, message, level = 'info', meta = {}) {
    entries.push({ stage, message, level, meta, ts: Date.now() });
    render();
  }

  function track(stage, fn) {
    add(stage, 'Running…', 'debug');
    const start = performance.now();
    const result = fn();
    add(stage, 'Completed', 'info', { duration_ms: performance.now() - start });
    return result;
  }

  function reset() {
    entries.splice(0, entries.length);
    render();
  }

  render();
  return { add, track, reset, entries };
}

let auditLoggerInstance = null;

export function getAuditLogger() {
  if (!auditLoggerInstance) {
    auditLoggerInstance = createAuditLogger();
  }
  return auditLoggerInstance;
}
