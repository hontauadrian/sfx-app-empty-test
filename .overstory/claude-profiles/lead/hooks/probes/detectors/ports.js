'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const { readRootPkg } = require('../lib/pkgjson');

// Port detection. Spec: plan 02 §7.2.
function derivePorts(root, bootPlan, frameworks, diag) {
  // A. portsCmd
  if (bootPlan.portsCmd) {
    try {
      const raw = execSync(bootPlan.portsCmd, {
        cwd: root,
        timeout: 5000,
        stdio: ['ignore', 'pipe', 'pipe'],
      }).toString();
      const parsed = JSON.parse(raw);
      return normalizePortKeys(parsed);
    } catch (execErr) {
      diag.warn(`portsCmd failed: ${execErr.message}`);
    }
  }

  // B. .stack.json
  if (bootPlan.alreadyRunning && bootPlan.stackFile) {
    try {
      const stackRaw = fs.readFileSync(path.join(root, bootPlan.stackFile), 'utf8');
      return normalizePortKeys(JSON.parse(stackRaw));
    } catch (readErr) {
      diag.warn(`stackFile parse failed: ${readErr.message}`);
    }
  }

  // C. env files
  const envPorts = readEnvFiles(root, bootPlan.envFiles || []);

  // D. CLI args from scripts.dev
  const scriptPorts = parseScriptPorts(root);

  // E. framework defaults
  const defaults = {};
  const web = frameworks.web || [];
  const api = frameworks.api || [];
  if (web.includes('next')) defaults.web = 3000;
  if (web.includes('vite-react')) defaults.web = 5173;
  if (web.includes('sveltekit')) defaults.web = 5173;
  if (web.includes('astro')) defaults.web = 4321;
  if (web.includes('nuxt')) defaults.web = 3000;
  if (api.includes('nest')) defaults.api = 3000;
  if (api.includes('express')) defaults.api = 3000;
  if (api.includes('fastify')) defaults.api = 3000;

  return { ...defaults, ...envPorts, ...scriptPorts };
}

function normalizePortKeys(raw) {
  const normalized = {};
  if (!raw || typeof raw !== 'object') return normalized;
  for (const [key, value] of Object.entries(raw)) {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber) && asNumber > 0) {
      normalized[key] = asNumber;
    }
  }
  return normalized;
}

function readEnvFiles(root, envFiles) {
  const ports = {};
  for (const rel of envFiles) {
    const full = path.join(root, rel);
    if (!fs.existsSync(full)) continue;
    let content;
    try { content = fs.readFileSync(full, 'utf8'); }
    catch (readErr) { void readErr; continue; }
    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
      if (!match) continue;
      const key = match[1];
      const rawValue = match[2].replace(/^['"]|['"]$/g, '').trim();
      if (/PORT$/.test(key)) {
        const port = Number(rawValue);
        if (Number.isFinite(port) && port > 0) {
          ports[key.toLowerCase()] = port;
        }
      }
    }
  }
  return ports;
}

function parseScriptPorts(root) {
  const pkg = readRootPkg(root);
  if (!pkg.scripts) return {};
  const ports = {};
  for (const [name, cmd] of Object.entries(pkg.scripts)) {
    const match = String(cmd).match(/--port\s+(\d+)/);
    if (match) ports[name] = Number(match[1]);
  }
  return ports;
}

module.exports = { derivePorts };
