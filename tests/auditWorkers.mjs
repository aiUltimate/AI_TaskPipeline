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

function buildSampleSnapshot() {
  return {
    url: 'https://example.com',
    title: 'Sample Page Title',
    meta_description: 'This is a concise meta description that is long enough to count.',
    canonical: 'https://example.com/',
    open_graph_title: 'OG Title',
    h1: 'Sample Heading',
    lang: 'en',
    text_content: 'Sample body text with keyword focus repeated once for testing focus keyword coverage.',
    headings: [
      { tag: 'h1', text: 'Sample Heading' },
      { tag: 'h2', text: 'Details' },
      { tag: 'h3', text: '' },
    ],
    images: [{ src: '/hero.png', alt: '' }],
    scripts: [
      { src: '/app.js', defer: false, async: false, inline_bytes: 0 },
      { src: '/vendor.js', defer: false, async: false, inline_bytes: 0 },
      { src: '/analytics.js', defer: false, async: false, inline_bytes: 0 },
    ],
    styles: [{ inline_bytes: 900 }],
    form_controls: [{ tag: 'input', name: 'email', label_text: '', aria_label: '', placeholder: '' }],
    links: [
      { href: 'https://external.test', text: 'External' },
      { href: '/internal', text: 'Internal' },
      { href: '#', text: 'Inert' },
    ],
  };
}

function main() {
  const snapshot = buildSampleSnapshot();

  const linkMap = computeLinkMap(snapshot);
  assert(linkMap.total === 3, 'Link map should count all anchors');
  assert(linkMap.external === 1 && linkMap.internal === 2, 'Link map should separate external/internal links');

  const accessibility = computeAccessibility(snapshot, linkMap);
  assert(accessibility.issues.length >= 4, 'Accessibility audit should flag missing alt, label, inert link, and empty heading');

  const seo = computeSeo(snapshot, 'focus');
  assert(seo.issues.length >= 1, 'SEO audit should detect at least one issue');

  const performance = computePerformance(snapshot);
  assert(performance.hints.length >= 2, 'Performance audit should flag blocking scripts and inline CSS');

  const content = computeContentSummary(snapshot);
  assert(content.sections.length === snapshot.headings.length, 'Content summary should include each heading');

  const report = computeAggregatedReport(snapshot, linkMap, accessibility, seo, performance, content, 'focus');
  assert(report.issues.length >= accessibility.issues.length, 'Aggregated report should include accessibility issues');
  assert(report.severity_counts.high + report.severity_counts.medium + report.severity_counts.low === report.issues.length,
    'Severity counts should sum to total issues');

  console.log('auditWorkers.mjs: pure worker tests passed');
}

main();
