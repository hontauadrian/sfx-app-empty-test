import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emptyReport, formatHumanReport, formatSummary, writeReport, SmokeReport } from '../smoke-report';

function sampleReport(overrides: Partial<SmokeReport> = {}): SmokeReport {
  return {
    ...emptyReport('builder', 'session', { readOnly: false, strict: false, fullScope: false }),
    summary: { total: 2, passed: 1, failed: 1, skipped: 0, durationMs: 123 },
    exitCode: 1,
    blockReason: 'API_500_RESPONSE:POST /x:boom',
    blockCodes: ['API_500_RESPONSE'],
    cases: [
      { label: 'ok', passed: true, status: 200, category: 'page' },
      { label: 'POST /x (happy)', passed: false, status: 500, blockReason: 'API_500_RESPONSE:POST /x:boom', category: 'endpoint' },
    ],
    ...overrides,
  };
}

test('emptyReport starts with zero totals and exit=0', () => {
  const report = emptyReport('builder', 'session', { readOnly: false, strict: false, fullScope: false });
  assert.equal(report.summary.total, 0);
  assert.equal(report.exitCode, 0);
  assert.equal(report.profile, 'builder');
});

test('formatSummary renders cases and summary line', () => {
  const text = formatSummary(sampleReport());
  assert.ok(text.includes('HTTP-smoke results:'));
  assert.ok(text.includes('✓ ok'));
  assert.ok(text.includes('✗ POST /x'));
  assert.ok(text.includes('[http-smoke-summary]'));
  assert.ok(text.includes('[http-smoke-block]'));
});

test('formatHumanReport includes block reason and failures section', () => {
  const text = formatHumanReport(sampleReport());
  assert.ok(text.includes('# HTTP Smoke Report'));
  assert.ok(text.includes('Block reason'));
  assert.ok(text.includes('API_500_RESPONSE'));
  assert.ok(text.includes('Failures'));
});

test('writeReport writes JSON to reportPath and human report to humanReportPath', () => {
  const dir = mkdtempSync(join(tmpdir(), 'smoke-report-'));
  try {
    const jsonPath = join(dir, 'report.json');
    const humanPath = join(dir, 'human.md');
    const report = sampleReport();
    writeReport(report, { reportPath: jsonPath, humanReportPath: humanPath });
    assert.ok(existsSync(jsonPath));
    assert.ok(existsSync(humanPath));
    const parsed = JSON.parse(readFileSync(jsonPath, 'utf8'));
    assert.equal(parsed.exitCode, 1);
    assert.deepEqual(parsed.blockCodes, ['API_500_RESPONSE']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('writeReport creates parent directories as needed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'smoke-report-'));
  try {
    const jsonPath = join(dir, 'nested', 'deep', 'report.json');
    writeReport(sampleReport(), { reportPath: jsonPath, humanReportPath: join(dir, 'nested', 'h.md') });
    assert.ok(existsSync(jsonPath));
    assert.ok(readdirSync(join(dir, 'nested')).length > 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('formatSummary surfaces stack stderr block when bootLogs is set', () => {
  const text = formatSummary(
    sampleReport({
      blockCodes: ['STACK_BOOT_FAILED'],
      blockReason: 'STACK_BOOT_FAILED:stack:boot stalled',
      bootLogs:
        '[Nest] ERROR  AppModule failed to boot\n' +
        'TypeError: this.$connect is not a function\n' +
        '    at PrismaService.onModuleInit (/app/prisma.service.ts:14:18)\n' +
        '    at MetadataScanner.scanFromPrototype',
    })
  );
  assert.ok(text.includes('[http-smoke-stack-stderr]'), 'stderr header missing');
  assert.ok(text.includes('TypeError: this.$connect is not a function'), 'verbatim stderr line missing');
  assert.ok(text.includes('[http-smoke-stack-stderr-end]'), 'stderr end marker missing');
  // The stderr block must appear AFTER the summary line so `tail -N` picks it up.
  const summaryIdx = text.indexOf('[http-smoke-summary]');
  const stderrIdx = text.indexOf('[http-smoke-stack-stderr]');
  assert.ok(summaryIdx > -1 && stderrIdx > summaryIdx, 'stderr block must follow summary line');
});

test('formatSummary truncates stack stderr to last 80 lines', () => {
  const longLogs = Array.from({ length: 200 }, (_, i) => `line-${i}`).join('\n');
  const text = formatSummary(sampleReport({ bootLogs: longLogs }));
  assert.ok(text.includes('line-199'), 'last line missing');
  assert.ok(text.includes('line-120'), 'expected first preserved line missing');
  assert.ok(!text.includes('line-100'), 'lines older than tail-80 should be dropped');
  assert.ok(!text.includes('line-50'), 'old lines should be dropped');
});

test('formatSummary omits stderr block when bootLogs is empty or whitespace', () => {
  const noLogs = formatSummary(sampleReport({ bootLogs: '' }));
  const wsLogs = formatSummary(sampleReport({ bootLogs: '   \n  \n' }));
  const undefinedLogs = formatSummary(sampleReport());
  assert.ok(!noLogs.includes('[http-smoke-stack-stderr]'));
  assert.ok(!wsLogs.includes('[http-smoke-stack-stderr]'));
  assert.ok(!undefinedLogs.includes('[http-smoke-stack-stderr]'));
});

test('formatHumanReport includes stack stderr fenced block when bootLogs is set', () => {
  const text = formatHumanReport(
    sampleReport({
      blockCodes: ['STACK_BOOT_FAILED'],
      blockReason: 'STACK_BOOT_FAILED:stack:boot stalled',
      bootLogs: 'TypeError: this.$connect is not a function\n  at PrismaService',
    })
  );
  assert.ok(text.includes('## Stack boot stderr (tail)'));
  assert.ok(text.includes('TypeError: this.$connect is not a function'));
  assert.ok(text.includes('```'));
});

test('writeReport persists bootLogs in the JSON artifact', () => {
  const dir = mkdtempSync(join(tmpdir(), 'smoke-report-bootlogs-'));
  try {
    const jsonPath = join(dir, 'report.json');
    const report = sampleReport({
      blockCodes: ['STACK_BOOT_FAILED'],
      bootLogs: 'TypeError: connect is not a function',
    });
    writeReport(report, { reportPath: jsonPath, humanReportPath: join(dir, 'h.md') });
    const parsed = JSON.parse(readFileSync(jsonPath, 'utf8'));
    assert.equal(parsed.bootLogs, 'TypeError: connect is not a function');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
