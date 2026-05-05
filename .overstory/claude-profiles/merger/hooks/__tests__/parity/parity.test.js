#!/usr/bin/env node
/**
 * Byte-parity test — asserts that hook/probe files required to be identical
 * across all 5 profiles (builder, lead, merger, reviewer, scout) have matching
 * sha256 hashes. Exceptions:
 *   - settings.json may diverge per profile.
 *   - .bash-allowlist.json may diverge per profile.
 *   - worker-done-evidence.js must exist in builder + lead only.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const PROFILES_DIR = path.resolve(__dirname, '..', '..', '..', '..');
const PROFILES = ['builder', 'lead', 'merger', 'reviewer', 'scout'];

/** Files under hooks/ that must be byte-identical across ALL 5 profiles. */
const PARITY_HOOK_FILES = [
  'no-generated-write.js',
  'no-ignore-for-changed-paths.js',
  'probe-covers-diff.js',
  'no-co-mingled-overlay-commit.js',
];

/** Files under hooks/probes/ that must be byte-identical across ALL 5 profiles. */
const PARITY_PROBE_FILES = [
  'flows-generator.js',
  'assertion-library.ts',
  'http-smoke.ts',
  'smoke-report.ts',
  'index.ts',
  'derive-test-matrix.js',
  'matrix-schema.json',
  'overlay-schema.json',
  'contract-types.d.ts',
  'contract-merge.js',
  'README.md',
];

/** Files under hooks/probes/lib/ that must be byte-identical across ALL 5 profiles. */
const PARITY_LIB_FILES = [
  'zod-introspect.ts',
  'zod-introspect-cli.ts',
  'enrich-matrix.js',
];

/** Test directories under hooks/__tests__/ whose contents must be byte-identical. */
const PARITY_TEST_DIRS = [
  'zod-introspect',
  'flows-generator',
  'run-flow-step',
  'defense-hooks',
  'contract-merge',
];

/** Files that must exist ONLY in specific profiles. */
const PROFILE_EXCLUSIVE = {
  'worker-done-evidence.js': ['builder', 'lead'],
};

/** Files that must NOT exist in any profile (deleted/retired). */
const MUST_NOT_EXIST = [
  'require-overlay-flow-coverage.js',
];

function sha256(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function collectFiles(dirPath) {
  const results = [];
  if (!fs.existsSync(dirPath)) return results;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results.sort();
}

function profilePath(profile, ...segments) {
  return path.join(PROFILES_DIR, profile, 'hooks', ...segments);
}

function checkParityFiles(label, relSegments, files) {
  let passed = 0;
  let failed = 0;

  for (const file of files) {
    const hashes = {};
    const missing = [];

    for (const profile of PROFILES) {
      const filePath = profilePath(profile, ...relSegments, file);
      if (!fs.existsSync(filePath)) {
        missing.push(profile);
      } else {
        hashes[profile] = sha256(filePath);
      }
    }

    if (missing.length > 0) {
      console.error(`FAIL [${label}] ${file} — missing in: ${missing.join(', ')}`);
      failed++;
      continue;
    }

    const uniqueHashes = new Set(Object.values(hashes));
    if (uniqueHashes.size === 1) {
      console.log(`PASS [${label}] ${file} — ${[...uniqueHashes][0].slice(0, 12)}`);
      passed++;
    } else {
      console.error(`FAIL [${label}] ${file} — hash mismatch:`);
      for (const profile of PROFILES) {
        console.error(`  ${profile}: ${hashes[profile]}`);
      }
      failed++;
    }
  }

  return { passed, failed };
}

function checkTestDirParity() {
  let passed = 0;
  let failed = 0;

  for (const testDir of PARITY_TEST_DIRS) {
    const builderDir = profilePath('builder', '__tests__', testDir);
    if (!fs.existsSync(builderDir)) {
      console.error(`FAIL [test-dir] ${testDir} — not found in builder`);
      failed++;
      continue;
    }

    const builderFiles = collectFiles(builderDir).map((f) =>
      path.relative(builderDir, f),
    );

    let dirOk = true;

    for (const profile of PROFILES.filter((p) => p !== 'builder')) {
      const profileDir = profilePath(profile, '__tests__', testDir);
      if (!fs.existsSync(profileDir)) {
        console.error(`FAIL [test-dir] ${testDir} — missing in ${profile}`);
        dirOk = false;
        continue;
      }

      const profileFiles = collectFiles(profileDir).map((f) =>
        path.relative(profileDir, f),
      );

      // Check same set of files
      const builderSet = new Set(builderFiles);
      const profileSet = new Set(profileFiles);
      const onlyInBuilder = builderFiles.filter((f) => !profileSet.has(f));
      const onlyInProfile = profileFiles.filter((f) => !builderSet.has(f));

      if (onlyInBuilder.length > 0) {
        console.error(
          `FAIL [test-dir] ${testDir} — files only in builder: ${onlyInBuilder.join(', ')}`,
        );
        dirOk = false;
      }
      if (onlyInProfile.length > 0) {
        console.error(
          `FAIL [test-dir] ${testDir} — files only in ${profile}: ${onlyInProfile.join(', ')}`,
        );
        dirOk = false;
      }

      // Check byte parity for shared files
      for (const relFile of builderFiles.filter((f) => profileSet.has(f))) {
        const bHash = sha256(path.join(builderDir, relFile));
        const pHash = sha256(path.join(profileDir, relFile));
        if (bHash !== pHash) {
          console.error(
            `FAIL [test-dir] ${testDir}/${relFile} — builder vs ${profile} hash mismatch`,
          );
          dirOk = false;
        }
      }
    }

    if (dirOk) {
      console.log(`PASS [test-dir] ${testDir} — all profiles match`);
      passed++;
    } else {
      failed++;
    }
  }

  return { passed, failed };
}

function checkExclusiveFiles() {
  let passed = 0;
  let failed = 0;

  for (const [file, allowedProfiles] of Object.entries(PROFILE_EXCLUSIVE)) {
    let fileOk = true;

    for (const profile of PROFILES) {
      const filePath = profilePath(profile, file);
      const exists = fs.existsSync(filePath);
      const shouldExist = allowedProfiles.includes(profile);

      if (shouldExist && !exists) {
        console.error(
          `FAIL [exclusive] ${file} — should exist in ${profile} but doesn't`,
        );
        fileOk = false;
      } else if (!shouldExist && exists) {
        console.error(
          `FAIL [exclusive] ${file} — should NOT exist in ${profile} but does`,
        );
        fileOk = false;
      }
    }

    // Check byte parity among allowed profiles
    const hashes = {};
    for (const profile of allowedProfiles) {
      const filePath = profilePath(profile, file);
      if (fs.existsSync(filePath)) {
        hashes[profile] = sha256(filePath);
      }
    }
    const uniqueHashes = new Set(Object.values(hashes));
    if (uniqueHashes.size > 1) {
      console.error(`FAIL [exclusive] ${file} — hash mismatch among allowed profiles:`);
      for (const [profile, hash] of Object.entries(hashes)) {
        console.error(`  ${profile}: ${hash}`);
      }
      fileOk = false;
    }

    if (fileOk) {
      console.log(`PASS [exclusive] ${file} — correct placement and parity`);
      passed++;
    } else {
      failed++;
    }
  }

  return { passed, failed };
}

function checkMustNotExist() {
  let passed = 0;
  let failed = 0;

  for (const file of MUST_NOT_EXIST) {
    let fileOk = true;
    for (const profile of PROFILES) {
      const filePath = profilePath(profile, file);
      if (fs.existsSync(filePath)) {
        console.error(
          `FAIL [deleted] ${file} — still exists in ${profile}`,
        );
        fileOk = false;
      }
    }
    if (fileOk) {
      console.log(`PASS [deleted] ${file} — absent from all profiles`);
      passed++;
    } else {
      failed++;
    }
  }

  return { passed, failed };
}

function main() {
  console.log('=== Byte-Parity Test ===\n');

  let totalPassed = 0;
  let totalFailed = 0;

  const results = [
    checkParityFiles('hooks', [], PARITY_HOOK_FILES),
    checkParityFiles('probes', ['probes'], PARITY_PROBE_FILES),
    checkParityFiles('probes/lib', ['probes', 'lib'], PARITY_LIB_FILES),
    checkTestDirParity(),
    checkExclusiveFiles(),
    checkMustNotExist(),
  ];

  for (const r of results) {
    totalPassed += r.passed;
    totalFailed += r.failed;
  }

  console.log(`\nTotal: ${totalPassed} passed, ${totalFailed} failed, ${totalPassed + totalFailed} checks`);
  return totalFailed === 0;
}

if (require.main === module) {
  const ok = main();
  process.exit(ok ? 0 : 1);
}

module.exports = { main };
