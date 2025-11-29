# AI Modular Pipeline – Webpage Task Proposal

## Current intent (from the demo file)
- The HTML demo shows JSON-first pipelines where each node is a pure function that transforms structured input to output and exposes the JSON at every stage for transparency.
- Pipelines share a consistent pattern: normalize messy input → build a provider-agnostic spec → adapt → execute (mock/API/LLM) → normalize output → render for humans.

## Single, web-focused task to complete next
**Deliver a full “Webpage Audit & Refresh” pipeline that coordinates multiple workers to ingest a URL, audit the page, and propose actionable improvements.** This is non-weather, inherently multi-node, and produces concrete assets (reports + rewritten content) that we can render in the browser.

### Why this task
- Naturally requires specialized sub-tasks: crawl & extract DOM, accessibility pass, SEO/metadata analysis, performance hints, content quality review, and rewrite suggestions.
- Mirrors the demo’s orchestration idea: a coordinator delegates to purpose-built nodes, aggregates JSON, and surfaces human-ready summaries.
- Provides a reusable foundation for other webpage operations (e.g., localization, A/B variant generation).

## Proposed pipeline shape (single big project)
1. **Input normalization**
   - Accept a URL or pasted HTML; fetch/crawl (mockable) and produce `PageSnapshot` with DOM, text, metadata, and trace of requests.
2. **Worker nodes (parallelizable)**
   - `LinkMap`: extract all links with status (internal/external, rel, anchor text).
   - `AccessibilityAudit`: run rules (alt text coverage, heading outline, ARIA roles) and flag issues.
   - `SEOAudit`: evaluate title/description length, canonical tags, schema.org, Open Graph, and keyword coverage against a provided focus term.
   - `PerformanceHints`: static heuristics on asset sizes, inline styles, and blocking scripts (no live Lighthouse; keep deterministic mocks).
   - `ContentSummary`: LLM-friendly chunking of visible text plus section-level summaries (mockable adapter).
3. **Coordinator & aggregation**
   - Orchestrate workers, merge outputs into a `PageReport` JSON with per-issue severity, affected selectors, and recommended fixes.
   - Produce a `RewritePlan` that includes improved title/description, alt text suggestions, and optional rewritten hero/CTA copy.
4. **Outputs**
   - Browser UI renders: JSON trace per node, a human-friendly report table, and downloadable markdown of the rewrite plan.
   - Node CLI renders: pretty-printed JSON and plaintext checklist.

## Implementation steps (repeatable pattern)
1. **Contracts and nodes**
   - Define TypeScript types for `PageSnapshot`, `LinkInfo`, `AccessibilityIssue`, `SEOIssue`, `PerformanceHint`, `ContentChunk`, `PageReport`, `RewritePlan`.
   - Implement each worker as `Node<TIn, TOut>` with deterministic mocks and configurable adapters (e.g., swap real fetch/LLM later).
2. **Pipeline runner core**
   - Reuse/extend a `Pipeline` class that sequences nodes, supports parallel execution where safe, and records intermediate JSON for observability.
3. **Browser + Node runtimes**
   - Browser: render JSON trace, report tables, and the rewrite plan preview; allow URL input and paste-your-own HTML.
   - Node: CLI command `npm run pipeline webpage --url "https://example.com"` with file-based fixtures for offline runs.
4. **Tests and fixtures**
   - Unit tests per worker with canned HTML fixtures; snapshots for report aggregation; seeded mocks for consistency.
5. **Docs and templates**
   - Document how to add new webpage workers (e.g., `LinkMap` variant for sitemap XML) and provide a folder template to replicate the pattern.

This single project delivers a complete, non-weather pipeline that exercises multiple cooperating workers while fitting the modular, JSON-first pattern from the demo.
