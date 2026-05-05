#!/usr/bin/env node
/* eslint-disable */
'use strict';

/**
 * Drift hook (Decision 8 / Phase 0b).
 *
 * Fires at builder close-gate as a PreToolUse on `git commit`,
 * `ov mail send --type worker_done`, and `sd close`. For every endpoint
 * (METHOD + path-template) introduced or modified by the builder's diff,
 * asserts that AT LEAST ONE flow file under
 * `.overstory/runtime-contract.flows/*.json` references it.
 *
 * On miss, blocks with reason `FLOW_NEW_ENDPOINT_UNCOVERED` and tells the
 * builder to mail the lead with `--type flow_mismatch`. The builder cannot
 * self-resolve; the flows folder is read-only for builders.
 *
 * Hook contract: PreToolUse — receives JSON on stdin, writes
 * { decision: 'block', reason: '...' } to stdout to block, or exits 0
 * silently to allow.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const FLOWS_DIR = path.join(PROJECT_DIR, '.overstory', 'runtime-contract.flows');

function allow() {
  process.exit(0);
}

function block(reason) {
  process.stdout.write(JSON.stringify({ decision: 'block', reason }));
  process.exit(0);
}

function readStdinSync() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function isCloseGateInvocation(input) {
  if (!input) return false;
  const trimmed = input.trim();
  if (!trimmed) return false;
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return false;
  }
  const tool = parsed.tool_name || parsed.tool || '';
  const params = parsed.tool_input || parsed.params || parsed.parameters || {};
  if (tool === 'Bash') {
    const cmd = String(params.command || '');
    if (/\bgit\s+commit\b/.test(cmd)) return { kind: 'git-commit' };
    if (/\bsd\s+close\b/.test(cmd)) return { kind: 'sd-close' };
    if (/\bov\s+mail\s+send\b[^|;]*--type\s+worker_done\b/.test(cmd)) {
      return { kind: 'worker-done' };
    }
  }
  return false;
}

function getDiffEndpoints() {
  // Files changed since divergence from main (or HEAD~1 if no main).
  let changedFiles = [];
  try {
    const base = (() => {
      try {
        return execSync('git merge-base HEAD origin/main', { cwd: PROJECT_DIR })
          .toString()
          .trim();
      } catch {
        try {
          return execSync('git merge-base HEAD main', { cwd: PROJECT_DIR })
            .toString()
            .trim();
        } catch {
          return 'HEAD~1';
        }
      }
    })();
    const out = execSync(`git diff --name-only ${base}...HEAD`, {
      cwd: PROJECT_DIR,
      encoding: 'utf8',
    });
    changedFiles = out.split('\n').filter(Boolean);
    // Also include uncommitted/staged changes — the close gate runs before commit.
    try {
      const staged = execSync('git diff --name-only --cached', {
        cwd: PROJECT_DIR,
        encoding: 'utf8',
      });
      const unstaged = execSync('git diff --name-only', {
        cwd: PROJECT_DIR,
        encoding: 'utf8',
      });
      const extra = (staged + '\n' + unstaged).split('\n').filter(Boolean);
      for (const f of extra) {
        if (!changedFiles.includes(f)) changedFiles.push(f);
      }
    } catch {
      /* ignore */
    }
  } catch {
    return [];
  }

  const endpoints = new Set();
  // Match NestJS controller decorators: @Get('path'), @Post("path"), etc.
  // Plus controller class @Controller('prefix')
  const methodRe = /@(Get|Post|Put|Patch|Delete|Options|Head)\s*\(\s*(?:['"`]([^'"`]*)['"`])?/g;
  const ctrlRe = /@Controller\s*\(\s*(?:['"`]([^'"`]*)['"`])?/;

  for (const file of changedFiles) {
    if (!/controller\.ts$/i.test(file) && !/route\.ts$/i.test(file)) continue;
    const abs = path.join(PROJECT_DIR, file);
    let body;
    try {
      body = fs.readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    const ctrlMatch = body.match(ctrlRe);
    const prefix = ctrlMatch && ctrlMatch[1] ? ctrlMatch[1] : '';
    let m;
    methodRe.lastIndex = 0;
    while ((m = methodRe.exec(body)) !== null) {
      const verb = m[1].toUpperCase();
      const sub = m[2] ?? '';
      const fullPath = '/' + [prefix, sub].filter(Boolean).join('/').replace(/\/+/g, '/').replace(/^\//, '');
      endpoints.add(`${verb} ${fullPath}`);
    }
  }
  return [...endpoints];
}

function loadFlowsCorpus() {
  if (!fs.existsSync(FLOWS_DIR)) return '';
  let corpus = '';
  for (const name of fs.readdirSync(FLOWS_DIR)) {
    if (!/\.json$/i.test(name)) continue;
    try {
      corpus += '\n' + fs.readFileSync(path.join(FLOWS_DIR, name), 'utf8');
    } catch {
      /* ignore */
    }
  }
  return corpus;
}

function isEndpointCovered(endpoint, corpus) {
  if (!corpus) return false;
  const [verb, p] = endpoint.split(' ');
  // The corpus is concatenated JSON. Three places a flow file can declare an
  // endpoint:
  //   1. contract.endpoint:  "endpoint": "GET /foo/:id"
  //   2. steps[].(method|path):  "method": "GET", … "path": "/foo/:id"
  //   3. resources[].create:  "method": "GET", "path": "/foo/:id"
  // We match all three with whitespace-tolerant patterns so JSON pretty-prints
  // (with newlines/spaces between tokens) match alongside compact forms.
  const endpointKey = new RegExp(
    `"endpoint"\\s*:\\s*"${verb}\\s+${escapeRe(p)}"`,
    'm',
  );
  if (endpointKey.test(corpus)) return true;
  const methodPath = new RegExp(
    `"method"\\s*:\\s*"${verb}"[\\s\\S]{0,200}?"path"\\s*:\\s*"${escapeRe(p)}"`,
    'm',
  );
  if (methodPath.test(corpus)) return true;
  return false;
}

function escapeRe(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function main() {
  const input = readStdinSync();
  const closeGate = isCloseGateInvocation(input);
  if (!closeGate) allow();

  const endpoints = getDiffEndpoints();
  if (endpoints.length === 0) allow();

  const corpus = loadFlowsCorpus();
  const uncovered = endpoints.filter((ep) => !isEndpointCovered(ep, corpus));
  if (uncovered.length === 0) allow();

  const list = uncovered.map((e) => `  - ${e}`).join('\n');
  block(
    'FLOW_NEW_ENDPOINT_UNCOVERED: endpoints introduced in your diff are not ' +
      'covered by any flow file under .overstory/runtime-contract.flows/.\n\n' +
      list +
      '\n\nYou cannot edit the flows folder. Mail the lead with ' +
      `--type flow_mismatch --subject 'New endpoint coverage needed: ${uncovered[0]}' ` +
      'and describe the endpoint shape (verb, path, request body, success ' +
      'status, error statuses, who can call it). The lead will invoke the ' +
      'task-flow-authoring skill to add the flow, then reply --type flow_update.',
  );
}

main();
