'use strict';

const fs = require('fs');
const path = require('path');

const { readRootPkg } = require('../lib/pkgjson');
const { isExecutable } = require('../lib/fsutil');

// Boot driver priority ladder. Spec: plan 02 §7.1.
function deriveBootPlan(root, frameworks, diag) {
  const driverCandidates = [
    'scripts/worktree-stack.sh',
    'scripts/dev-stack.sh',
    'scripts/stack.sh',
    'bin/boot',
    'bin/up',
  ];
  for (const rel of driverCandidates) {
    const abs = path.join(root, rel);
    if (fs.existsSync(abs) && isExecutable(abs)) {
      return {
        driver: 'worktree-stack',
        driverPath: rel,
        startCmd: `${rel} start`,
        stopCmd: `${rel} stop`,
        portsCmd: `${rel} ports`,
        stackFile: '.stack.json',
        alreadyRunning: fs.existsSync(path.join(root, '.stack.json')),
        envFiles: pickEnvFiles(root),
        ports: {},
      };
    }
  }

  if (fs.existsSync(path.join(root, '.stack.json'))) {
    return {
      driver: 'none',
      driverPath: null,
      stackFile: '.stack.json',
      alreadyRunning: true,
      startCmd: null,
      stopCmd: null,
      portsCmd: null,
      envFiles: pickEnvFiles(root),
      ports: {},
    };
  }

  const pkg = readRootPkg(root);
  if (pkg.scripts && pkg.scripts.dev) {
    const packageManager = detectPackageManager(root);
    return {
      driver: 'package-json',
      driverPath: 'package.json',
      startCmd: `${packageManager} dev`,
      stopCmd: null,
      portsCmd: null,
      alreadyRunning: false,
      envFiles: pickEnvFiles(root),
      ports: {},
    };
  }

  for (const name of ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml']) {
    const dcPath = path.join(root, name);
    if (fs.existsSync(dcPath)) {
      return {
        driver: 'docker-compose',
        driverPath: path.relative(root, dcPath),
        startCmd: 'docker compose up -d',
        stopCmd: 'docker compose down',
        portsCmd: null,
        alreadyRunning: false,
        envFiles: pickEnvFiles(root),
        ports: {},
      };
    }
  }

  if (fs.existsSync(path.join(root, 'turbo.json'))) {
    return {
      driver: 'turbo',
      driverPath: 'turbo.json',
      startCmd: 'npx turbo run dev --parallel',
      stopCmd: null,
      portsCmd: null,
      alreadyRunning: false,
      envFiles: pickEnvFiles(root),
      ports: {},
    };
  }
  if (fs.existsSync(path.join(root, 'nx.json'))) {
    return {
      driver: 'turbo',
      driverPath: 'nx.json',
      startCmd: 'npx nx run-many -t serve',
      stopCmd: null,
      portsCmd: null,
      alreadyRunning: false,
      envFiles: pickEnvFiles(root),
      ports: {},
    };
  }

  return frameworkDefault(frameworks, root);
}

function frameworkDefault(frameworks, root) {
  const envFiles = pickEnvFiles(root);
  const web = (frameworks.web || [])[0];
  const api = (frameworks.api || [])[0];
  if (!web && !api) {
    return {
      driver: 'none', driverPath: null, startCmd: null, stopCmd: null,
      portsCmd: null, alreadyRunning: false, envFiles, ports: {},
    };
  }
  const startByWeb = {
    next: 'npx next dev',
    nuxt: 'npx nuxt dev',
    sveltekit: 'npm run dev',
    remix: 'npx remix dev',
    astro: 'npx astro dev',
  };
  const startByApi = {
    nest: 'npx nest start --watch',
    express: 'node src/server.js',
    fastify: 'node src/server.js',
  };
  const startCmd = startByWeb[web] || startByApi[api] || null;
  return {
    driver: 'framework-defaults',
    driverPath: null,
    startCmd,
    stopCmd: null,
    portsCmd: null,
    alreadyRunning: false,
    envFiles,
    ports: {},
  };
}

function detectPackageManager(root) {
  if (fs.existsSync(path.join(root, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(root, 'yarn.lock'))) return 'yarn';
  if (fs.existsSync(path.join(root, 'bun.lockb'))) return 'bun';
  return 'npm run';
}

function pickEnvFiles(root) {
  const candidates = ['.env', '.env.local', '.env.development', '.env.development.local'];
  return candidates.filter((rel) => fs.existsSync(path.join(root, rel)));
}

module.exports = { deriveBootPlan };
