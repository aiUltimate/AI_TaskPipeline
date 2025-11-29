import { runDelegatedJob } from '../assets/js/coordinator.js';
import {
  computeLinkMap,
  computeAccessibility,
  computeSeo,
  computePerformance,
  computeContentSummary,
  computeAggregatedReport,
} from '../assets/js/auditWorkers.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function buildSnapshot() {
  return {
    url: 'https://integration.test',
    title: 'Integration Snapshot',
    meta_description: 'A deliberately long meta description for integration testing of the audit pipeline.',
    canonical: 'https://integration.test/',
    open_graph_title: 'Integration OG',
    h1: 'Integration H1',
    lang: 'en',
    text_content: 'Integration keyword coverage text with keyword present multiple times keyword.',
    headings: [
      { tag: 'h1', text: 'Integration H1' },
      { tag: 'h2', text: 'Section' },
    ],
    images: [
      { src: '/hero.png', alt: 'Hero image' },
    ],
    scripts: [
      { src: '/app.js', defer: true, async: false, inline_bytes: 0 },
      { src: '/analytics.js', defer: false, async: false, inline_bytes: 0 },
    ],
    styles: [{ inline_bytes: 200 }],
    form_controls: [
      { tag: 'input', name: 'email', label_text: 'Email', aria_label: '', placeholder: '' },
    ],
    links: [
      { href: 'https://external.test', text: 'External' },
      { href: '/internal', text: 'Internal' },
    ],
  };
}

async function main() {
  const snapshot = buildSnapshot();
  const workers = [
    {
      key: 'snapshot',
      label: 'Snapshot',
      run: () => snapshot,
    },
    {
      key: 'links',
      dependsOn: ['snapshot'],
      run: (results) => computeLinkMap(results.snapshot),
    },
    {
      key: 'accessibility',
      dependsOn: ['snapshot', 'links'],
      run: (results) => computeAccessibility(results.snapshot, results.links),
    },
    {
      key: 'seo',
      dependsOn: ['snapshot'],
      run: (results) => computeSeo(results.snapshot, 'keyword'),
    },
    {
      key: 'performance',
      dependsOn: ['snapshot'],
      run: (results) => computePerformance(results.snapshot),
    },
    {
      key: 'content',
      dependsOn: ['snapshot'],
      run: (results) => computeContentSummary(results.snapshot),
    },
    {
      key: 'report',
      dependsOn: ['snapshot', 'links', 'accessibility', 'seo', 'performance', 'content'],
      run: (results) =>
        computeAggregatedReport(
          results.snapshot,
          results.links,
          results.accessibility,
          results.seo,
          results.performance,
          results.content,
          'keyword'
        ),
    },
  ];

  const { results, duration_ms } = await runDelegatedJob({
    jobName: 'Audit integration test',
    workers,
    concurrency: 2,
  });

  assert(duration_ms > 0, 'Duration should be recorded');
  assert(results.report.issues.length >= results.accessibility.issues.length, 'Report includes accessibility findings');
  assert(results.report.severity_counts.high + results.report.severity_counts.medium + results.report.severity_counts.low === results.report.issues.length,
    'Severity counts match total issues');
  assert(results.links.total === snapshot.links.length, 'Link map reflects snapshot links');

  console.log('auditIntegration.mjs: delegated audit pipeline integration passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
