#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const resultsFile = path.resolve(__dirname, 'test-results.json');

if (!fs.existsSync(resultsFile)) {
  console.error('test-results.json not found. Run `playwright test` first.');
  process.exit(1);
}

let results;
try {
  results = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));
} catch (err) {
  console.error('Failed to parse test-results.json:', err.message);
  process.exit(1);
}

const suites = results.suites || [];
const failures = [];

function extractFailures(suite, filePath) {
  const file = suite.file || filePath || '';
  for (const spec of suite.specs || []) {
    for (const test of spec.tests || []) {
      for (const result of test.results || []) {
        if (result.status === 'failed' || result.status === 'timedOut') {
          const error = result.errors && result.errors.length > 0
            ? result.errors[0].message || result.errors[0].value || 'Unknown error'
            : 'No error message';
          const location = spec.file
            ? `${spec.file}:${spec.line || '?'}`
            : file
              ? `${file}:${spec.line || '?'}`
              : 'unknown location';
          failures.push({
            location,
            title: spec.title,
            status: result.status,
            error: error.split('\n')[0].trim(),
          });
        }
      }
    }
  }
  for (const child of suite.suites || []) {
    extractFailures(child, file);
  }
}

for (const suite of suites) {
  extractFailures(suite, suite.file || '');
}

const stats = results.stats || {};
const total   = stats.expected  !== undefined ? stats.expected  : '?';
const passed  = stats.expected  !== undefined ? stats.expected - (stats.unexpected || 0) : '?';
const failed  = stats.unexpected !== undefined ? stats.unexpected : failures.length;
const skipped = stats.skipped   !== undefined ? stats.skipped   : '?';
const duration = stats.duration !== undefined
  ? `${(stats.duration / 1000).toFixed(1)}s`
  : '?';

console.log('');
console.log('══════════════════════════════════════════════════════');
console.log('  Playwright Test Summary');
console.log('══════════════════════════════════════════════════════');
console.log(`  Total:    ${total}`);
console.log(`  Passed:   ${passed}`);
console.log(`  Failed:   ${failed}`);
console.log(`  Skipped:  ${skipped}`);
console.log(`  Duration: ${duration}`);
console.log('══════════════════════════════════════════════════════');

if (failures.length === 0) {
  console.log('  All tests passed!');
  console.log('══════════════════════════════════════════════════════');
  console.log('');
  process.exit(0);
}

console.log(`\n  FAILURES (${failures.length}):\n`);
for (let i = 0; i < failures.length; i++) {
  const f = failures[i];
  console.log(`  ${i + 1}. [${f.status.toUpperCase()}] ${f.title}`);
  console.log(`     Location: ${f.location}`);
  console.log(`     Error:    ${f.error}`);
  console.log('');
}
console.log('══════════════════════════════════════════════════════');
console.log('');
process.exit(1);
