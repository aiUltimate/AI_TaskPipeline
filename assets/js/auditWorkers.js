// Pure worker logic for the audit pipeline, extracted for reuse and testing.
// These helpers intentionally avoid touching the DOM so they can run in
// browser, Node, or other runtimes.

export function computeLinkMap(snapshot) {
  const anchors = snapshot.links || [];
  const external = anchors.filter((a) => typeof a.href === 'string' && a.href.startsWith('http')).length;
  const internal = anchors.length - external;
  return {
    type: 'LinkMap',
    total: anchors.length,
    external,
    internal,
    anchors: anchors.slice(0, 25),
    meta: { mapped_at: Date.now() },
  };
}

export function computeAccessibility(snapshot, linkMap) {
  const issues = [];
  const headings = snapshot.headings || [];
  const headingLevels = headings.map((h) => String(h.tag || '').replace('h', '')).map(Number).filter((n) => !Number.isNaN(n));
  const langMissing = !snapshot.lang;
  const hasH1 = headings.some((h) => h.tag === 'h1');
  const links = snapshot.links || [];
  const images = snapshot.images || [];
  const formControls = snapshot.form_controls || [];

  const headingGaps = headingLevels.some((level, idx) => {
    if (idx === 0) return false;
    const prev = headingLevels[idx - 1];
    return level - prev > 1;
  });

  if (!hasH1) {
    issues.push({ severity: 'high', message: 'Missing H1 heading', recommendation: 'Add a single H1.' });
  }

  const headingsWithoutText = headings.filter((h) => !h.text);
  if (headingsWithoutText.length) {
    issues.push({ severity: 'medium', message: `${headingsWithoutText.length} heading(s) are empty.` });
  }

  const imagesMissingAlt = images.filter((img) => !img.alt);
  if (imagesMissingAlt.length) {
    issues.push({ severity: 'high', message: `${imagesMissingAlt.length} image(s) missing alt text.` });
  }

  if (headingGaps) {
    issues.push({ severity: 'medium', message: 'Heading levels skip a level (e.g., h2 → h4).' });
  }

  const linkWithoutHref = links.filter((l) => !l.href);
  if (linkWithoutHref.length) {
    issues.push({ severity: 'high', message: `${linkWithoutHref.length} anchor(s) missing href.` });
  }

  const inertAnchors = links.filter((l) => l.href === '#');
  if (inertAnchors.length) {
    issues.push({ severity: 'medium', message: `${inertAnchors.length} anchor(s) use #; add real targets.` });
  }

  const controlsMissingLabels = formControls.filter((c) => !c.label_text && !c.aria_label && !c.placeholder);
  if (controlsMissingLabels.length) {
    issues.push({
      severity: 'high',
      message: `${controlsMissingLabels.length} form control(s) have no label, aria-label, or placeholder.`,
      recommendation: 'Add accessible labels to form controls.',
    });
  }

  if (langMissing) {
    issues.push({ severity: 'medium', message: 'Missing lang attribute on <html>.' });
  }

  return {
    type: 'AccessibilityAudit',
    lang: snapshot.lang,
    issues,
    link_totals: linkMap,
    meta: { audited_at: Date.now() },
  };
}

export function computeSeo(snapshot, focusKeyword = '') {
  const issues = [];
  const notes = [];

  if (!snapshot.title) {
    issues.push({ severity: 'high', message: 'Missing <title> tag' });
  } else if (snapshot.title.length < 25) {
    issues.push({ severity: 'low', message: 'Title is short; consider expanding to ~50–60 chars.' });
  }

  if (!snapshot.meta_description) {
    issues.push({ severity: 'medium', message: 'Missing meta description' });
  } else if (snapshot.meta_description.length < 80 || snapshot.meta_description.length > 170) {
    issues.push({ severity: 'low', message: 'Meta description length should be ~140–155 chars.' });
  }

  if (!snapshot.canonical) {
    issues.push({ severity: 'low', message: 'Missing canonical link' });
  }

  if (!snapshot.h1) {
    issues.push({ severity: 'medium', message: 'No H1 detected' });
  }

  if (snapshot.h1 && snapshot.title && snapshot.h1 === snapshot.title) {
    issues.push({ severity: 'low', message: 'H1 matches the title exactly; vary the heading copy.' });
  }

  if (focusKeyword) {
    const safeKeyword = focusKeyword.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    const keywordRegex = new RegExp(safeKeyword, 'gi');
    const keywordCount = (snapshot.text_content.match(keywordRegex) || []).length;
    if (keywordCount === 0) {
      issues.push({ severity: 'medium', message: `Focus keyword "${focusKeyword}" not found in body.` });
    } else {
      notes.push(`Focus keyword appears ${keywordCount} time(s).`);
    }

    const inTitle = (snapshot.title || '').toLowerCase().includes(focusKeyword.toLowerCase());
    const inDescription = (snapshot.meta_description || '').toLowerCase().includes(focusKeyword.toLowerCase());
    const inH1 = (snapshot.h1 || '').toLowerCase().includes(focusKeyword.toLowerCase());
    if (!inTitle) issues.push({ severity: 'low', message: 'Keyword missing from title tag.' });
    if (!inDescription) issues.push({ severity: 'low', message: 'Keyword missing from meta description.' });
    if (!inH1) issues.push({ severity: 'low', message: 'Keyword missing from H1.' });
  }

  if (!snapshot.open_graph_title) {
    issues.push({ severity: 'low', message: 'Missing Open Graph title (og:title).' });
  }

  return {
    type: 'SEOAudit',
    title: snapshot.title,
    meta_description: snapshot.meta_description,
    canonical: snapshot.canonical,
    open_graph_title: snapshot.open_graph_title,
    issues,
    notes,
    meta: { audited_at: Date.now() },
  };
}

export function computePerformance(snapshot) {
  const hints = [];
  const styles = snapshot.styles || [];
  const scripts = snapshot.scripts || [];
  const totalInlineCss = styles.reduce((acc, s) => acc + (s.inline_bytes || 0), 0);
  if (totalInlineCss > 800) {
    hints.push({ severity: 'medium', message: 'Large inline styles detected; consider externalizing CSS.' });
  }

  const blockingScripts = scripts.filter((s) => !s.defer && !s.async && s.src);
  if (blockingScripts.length > 2) {
    hints.push({ severity: 'medium', message: `${blockingScripts.length} blocking scripts; add defer/async.` });
  }

  const inlineJsBytes = scripts.reduce((acc, s) => acc + (s.inline_bytes || 0), 0);
  if (inlineJsBytes > 1200) {
    hints.push({ severity: 'low', message: 'Large inline scripts; move to external files and compress.' });
  }

  return {
    type: 'PerformanceHints',
    hints,
    totals: {
      scripts: scripts.length,
      blocking_scripts: blockingScripts.length,
      inline_js_bytes: inlineJsBytes,
      inline_css_bytes: totalInlineCss,
    },
    meta: { audited_at: Date.now() },
  };
}

export function computeContentSummary(snapshot) {
  const textContent = snapshot.text_content || '';
  const paragraphs = textContent
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const chunks = [];
  let buffer = '';
  paragraphs.forEach((p) => {
    if ((buffer + ' ' + p).trim().length > 320) {
      if (buffer) chunks.push(buffer.trim());
      buffer = p;
    } else {
      buffer = (buffer + ' ' + p).trim();
    }
  });
  if (buffer) chunks.push(buffer);

  const headings = snapshot.headings || [];
  const sections = headings.map((h, idx) => ({
    id: `${h.tag || 'h'}-${idx}`,
    heading: h.text,
    excerpt: (chunks[idx] || chunks[0] || '').slice(0, 180),
  }));

  return {
    type: 'ContentSummary',
    sections,
    chunks: chunks.slice(0, 6).map((c, idx) => ({ id: idx, text: c })),
    meta: { summarized_at: Date.now() },
  };
}

export function computeAggregatedReport(snapshot, linkMap, accessibility, seo, performance, content, focusKeyword = '') {
  const severityRank = { high: 3, medium: 2, low: 1 };
  const allIssues = [
    ...(accessibility?.issues || []),
    ...(seo?.issues || []).map((i, idx) => ({ ...i, id: `seo-${idx}` })),
    ...(performance?.hints || []).map((h, idx) => ({ ...h, id: `perf-${idx}` })),
  ];

  const ordered = allIssues.sort((a, b) => (severityRank[b.severity] || 0) - (severityRank[a.severity] || 0));

  const severityCounts = ordered.reduce(
    (acc, issue) => {
      acc[issue.severity] = (acc[issue.severity] || 0) + 1;
      return acc;
    },
    { high: 0, medium: 0, low: 0 }
  );

  const rewritePlan = {
    improved_title: snapshot.title || 'Add a clear, benefit-driven title',
    improved_description:
      snapshot.meta_description || 'Craft a 140–155 character description that highlights the focus keyword and value.',
    hero_cta: 'Rephrase hero copy with a single primary action and one supportive link.',
    accessibility: (accessibility?.issues || [])
      .filter((i) => i.severity === 'high' && i.recommendation)
      .map((i) => i.recommendation),
    seo_keyword: focusKeyword || 'Set a target keyword and weave it naturally into headings.',
  };

  return {
    type: 'PageReport',
    snapshot: { url: snapshot.url, focus_keyword: focusKeyword, title: snapshot.title },
    link_map: { total: linkMap?.total || 0, external: linkMap?.external || 0, internal: linkMap?.internal || 0 },
    issues: ordered,
    severity_counts: severityCounts,
    performance_totals: performance?.totals || { scripts: 0, blocking_scripts: 0, inline_js_bytes: 0, inline_css_bytes: 0 },
    content_summary: {
      sections: content?.sections?.length || 0,
      sample_headings: (content?.sections || []).slice(0, 3).map((s) => s.heading),
    },
    rewrite_plan: rewritePlan,
    meta: { aggregated_at: Date.now() },
  };
}
