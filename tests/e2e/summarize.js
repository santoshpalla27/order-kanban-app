#!/usr/bin/env node
/**
 * Playwright E2E — Failure Summary
 *
 * Parses test-results.json and prints a clean, copy-pasteable failure report.
 * Usage: node summarize.js [path/to/test-results.json]
 */
'use strict';

const fs   = require('fs');
const path = require('path');

// ── ANSI colours ─────────────────────────────────────────────────────────────
const R = '\x1b[0m', B = '\x1b[1m', DIM = '\x1b[2m',
      RED = '\x1b[31m', GRN = '\x1b[32m', YLW = '\x1b[33m', CYN = '\x1b[36m';

// ── Load results file ─────────────────────────────────────────────────────────
const file = process.argv[2] || 'test-results.json';
if (!fs.existsSync(file)) {
  console.log(`${YLW}No results file found at ${file}${R}`);
  process.exit(0);
}

let data;
try { data = JSON.parse(fs.readFileSync(file, 'utf8')); }
catch (e) { console.log(`${RED}Could not parse ${file}: ${e.message}${R}`); process.exit(0); }

// ── Walk suites and collect failures ─────────────────────────────────────────
const failures = [];
let passed = 0, skipped = 0, flaky = 0;

function shortPath(p) {
  if (!p) return '';
  const idx = p.indexOf('specs/');
  return idx >= 0 ? p.slice(idx) : path.basename(p);
}

function walkSuites(suites, parentFile) {
  for (const suite of (suites || [])) {
    const fp = suite.file || parentFile || '';

    for (const spec of (suite.specs || [])) {
      for (const test of (spec.tests || [])) {
        // Only count chromium project (skip setup duplicates)
        if (test.projectName && test.projectName === 'setup') continue;

        // Use last result (after retries)
        const result = (test.results || []).slice(-1)[0];
        if (!result) continue;

        const s = result.status;
        if (s === 'passed')  { passed++;  continue; }
        if (s === 'skipped') { skipped++; continue; }

        // failed or timedOut
        const err = result.error || {};
        const msgRaw = err.message || err.value || 'No error message';
        // Trim giant stack traces — keep first 8 lines
        const msgLines = msgRaw.split('\n').slice(0, 8);

        // Resolve best location: error location first, then test location
        const loc = err.location || test.location || {};
        const locStr = loc.file
          ? `${shortPath(loc.file)}:${loc.line || '?'}`
          : shortPath(fp);

        // Build breadcrumb title from spec titlePath
        const crumbs = [...(spec.titlePath || []), spec.title].filter(Boolean);
        const fullTitle = crumbs.length ? crumbs.join(' › ') : spec.title;

        failures.push({
          locStr,
          fullTitle,
          status: s === 'timedOut' ? 'timeout' : 'failed',
          duration: result.duration,
          retry: result.retry || 0,
          msgLines,
          snippet: (err.snippet || '').split('\n').slice(0, 10),
        });
      }
    }

    walkSuites(suite.suites, fp);
  }
}

walkSuites(data.suites);

// Use stats block if available for more accurate counts
const stats = data.stats || {};
if (stats.expected  !== undefined) passed   = stats.expected;
if (stats.flaky     !== undefined) flaky    = stats.flaky;
if (stats.skipped   !== undefined) skipped  = stats.skipped;

const total    = passed + failures.length + flaky + skipped;
const dur      = stats.duration ? `${(stats.duration / 1000).toFixed(1)}s` : '';
const LINE     = '─'.repeat(72);
const DLINE    = '═'.repeat(72);
const failIcon = failures.length > 0 ? `${RED}${B}` : GRN;

// ── Header ────────────────────────────────────────────────────────────────────
console.log('\n' + B + DLINE + R);
console.log(B + ` E2E Results${dur ? '  —  ' + dur : ''}` + R);
console.log(B + DLINE + R);
console.log(
  `  ${GRN}${B}✓ ${passed} passed${R}` +
  `   ${failIcon}✗ ${failures.length} failed${R}` +
  (flaky   ? `   ${YLW}~ ${flaky} flaky${R}` : '') +
  (skipped ? `   ${DIM}⊘ ${skipped} skipped${R}` : '') +
  `   ${DIM}(${total} total)${R}`
);

if (failures.length === 0) {
  console.log(`\n  ${GRN}${B}All tests passed!${R}`);
  console.log(B + DLINE + R + '\n');
  process.exit(0);
}

// ── Failures ──────────────────────────────────────────────────────────────────
console.log(`\n${B}${RED} ${failures.length} FAILURE${failures.length > 1 ? 'S' : ''}${R}`);
console.log(LINE);

failures.forEach((f, i) => {
  const retryNote = f.retry > 0 ? ` ${DIM}(retry ${f.retry})${R}` : '';
  const dStr      = f.duration ? ` ${DIM}${(f.duration / 1000).toFixed(1)}s${R}` : '';

  console.log();
  console.log(`${B} [${i + 1}]  ${CYN}${f.locStr}${R}${dStr}${retryNote}`);
  console.log(`       ${B}${f.fullTitle}${R}  ${RED}(${f.status})${R}`);
  console.log();

  for (const line of f.msgLines) {
    console.log(`       ${RED}${line}${R}`);
  }

  if (f.snippet.length > 0) {
    console.log();
    for (const line of f.snippet) {
      console.log(`       ${DIM}${line}${R}`);
    }
  }

  if (i < failures.length - 1) console.log('\n' + LINE);
});

console.log('\n' + B + DLINE + R + '\n');

// Exit non-zero so Docker / run-all.sh sees the failure
process.exit(failures.length > 0 ? 1 : 0);
