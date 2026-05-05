#!/usr/bin/env node
/**
 * Browser MCP health check & auto-installer.
 *
 * Usage:
 *   node .claude/hooks/check-browser-mcp.js            # check only
 *   node .claude/hooks/check-browser-mcp.js --setup     # check + auto-install missing pieces
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const AUTO_FIX = process.argv.includes('--setup');
const PROJECT_DIR = path.resolve(__dirname, '..', '..');
const MCP_CONFIG = path.join(PROJECT_DIR, '.mcp.json');

const MCP_JSON_TEMPLATE = {
  mcpServers: {
    playwright: {
      command: 'npx',
      args: ['-y', '@playwright/mcp'],
      type: 'stdio',
    },
  },
};

const results = { passed: [], fixed: [], failed: [] };

function run(cmd, opts = {}) {
  return execSync(cmd, { timeout: 60000, stdio: 'pipe', ...opts }).toString();
}

function check(label, testFn, fixFn) {
  try {
    testFn();
    results.passed.push(label);
  } catch (err) {
    if (AUTO_FIX && fixFn) {
      try {
        console.log(`  Fixing: ${label}...`);
        fixFn();
        testFn(); // verify the fix worked
        results.fixed.push(label);
      } catch (fixErr) {
        results.failed.push(`${label}: ${fixErr.message || fixErr}`);
      }
    } else {
      results.failed.push(`${label}: ${err.message || err}`);
    }
  }
}

// ── 1. .mcp.json exists with playwright entry ───────────────────────
check(
  '.mcp.json configured',
  () => {
    if (!fs.existsSync(MCP_CONFIG)) throw new Error('File not found');
    const config = JSON.parse(fs.readFileSync(MCP_CONFIG, 'utf8'));
    if (!config.mcpServers?.playwright) throw new Error('No playwright entry');
  },
  () => {
    if (!fs.existsSync(MCP_CONFIG)) {
      fs.writeFileSync(MCP_CONFIG, JSON.stringify(MCP_JSON_TEMPLATE, null, 2) + '\n');
    } else {
      const config = JSON.parse(fs.readFileSync(MCP_CONFIG, 'utf8'));
      config.mcpServers = config.mcpServers || {};
      config.mcpServers.playwright = MCP_JSON_TEMPLATE.mcpServers.playwright;
      fs.writeFileSync(MCP_CONFIG, JSON.stringify(config, null, 2) + '\n');
    }
  }
);

// ── 2. @playwright/mcp package available ────────────────────────────
check(
  '@playwright/mcp resolvable',
  () => {
    const out = run('npx @playwright/mcp --version 2>&1');
    if (!out.match(/\d/)) throw new Error('Version output empty');
  },
  () => {
    // npx -y will auto-install, just warm the cache
    run('npx -y @playwright/mcp --version 2>&1', { timeout: 120000 });
  }
);

// ── 3. Playwright browsers installed ────────────────────────────────
check(
  'Playwright browsers installed',
  () => {
    // Check if chromium binary exists in playwright cache
    const out = run('npx playwright install --dry-run 2>&1');
    if (out.toLowerCase().includes('chromium') && out.toLowerCase().includes('not installed')) {
      throw new Error('Chromium not installed');
    }
  },
  () => {
    console.log('  Installing Chromium (this may take a minute)...');
    run('npx playwright install chromium 2>&1', { timeout: 300000 });
  }
);

// ── 4. Smoke test — can the MCP server launch ───────────────────────
check(
  'MCP server can launch',
  () => {
    const result = run('timeout 5 npx -y @playwright/mcp 2>&1 || true', {
      timeout: 15000,
    });
    if (result.includes('Cannot find module') || result.includes('ERR!')) {
      throw new Error(`Server crashed: ${result.slice(0, 200)}`);
    }
  },
  null // no auto-fix — if previous steps passed, this should work
);

// ── Report ──────────────────────────────────────────────────────────
const allGood = results.failed.length === 0;

console.log('\n=== Browser MCP Health Check ===\n');

if (results.passed.length > 0) {
  console.log('PASSED:');
  results.passed.forEach((p) => console.log(`  \u2713 ${p}`));
}

if (results.fixed.length > 0) {
  console.log('\nAUTO-FIXED:');
  results.fixed.forEach((f) => console.log(`  \u2699 ${f}`));
}

if (results.failed.length > 0) {
  console.log('\nFAILED:');
  results.failed.forEach((f) => console.log(`  \u2717 ${f}`));
  if (!AUTO_FIX) {
    console.log('\nRun with --setup to auto-install everything:');
    console.log('  node .claude/hooks/check-browser-mcp.js --setup');
  }
}

console.log(`\nResult: ${allGood ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED'}\n`);
process.exit(allGood ? 0 : 1);
