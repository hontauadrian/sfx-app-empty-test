#!/usr/bin/env node
/**
 * Plan 03 fixture runner — drives e2e-test-on-stop.js against synthesized
 * evidence logs and asserts that the correlator emits the expected
 * block/no-block decision.
 *
 * Layout expected under __tests__/fixtures/:
 *   <name>.session.jsonl       — pre-populated evidence records
 *   <name>.matrix.json         — plan-02 matrix.json fixture
 *   <name>.sessionfiles.json   — { files: [...] } session file
 *   <name>.overlay.json        — (optional) plan-05 overlay.json
 *   <name>.expected.json       — either { exitCode:0, stdoutEmpty:true }
 *                                or { decision:'block', reasonContains:[...] }
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const HOOK_PATH = path.resolve(__dirname, '..', 'e2e-test-on-stop.js');
const FIXTURE_DIR = path.join(__dirname, 'fixtures');

function listFixtures() {
  const names = new Set();
  for (const file of fs.readdirSync(FIXTURE_DIR)) {
    const match = /^(.+?)\.(session|matrix|sessionfiles|overlay|expected)\.(json|jsonl)$/.exec(file);
    if (match) names.add(match[1]);
  }
  return Array.from(names).sort();
}

function readOptional(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function mkTmpProject() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'plan03-fixture-'));
  // mark as web project — next dep triggers isWebProject()
  fs.writeFileSync(
    path.join(tmp, 'package.json'),
    JSON.stringify({ name: 'plan03-fx', dependencies: { next: '15.0.0' } }, null, 2)
  );
  return tmp;
}

function writeEvidenceLog(projectDir, sessionId, jsonlText) {
  const dir = path.join(projectDir, '.claude', 'hooks', '.mcp-evidence');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${sessionId}.jsonl`), jsonlText || '');
}

function writeMatrix(projectDir, matrixText) {
  const dir = path.join(projectDir, '.claude', 'hooks');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '.matrix.json'), matrixText);
}

function writeOverlay(projectDir, overlayText) {
  fs.writeFileSync(path.join(projectDir, '.runtime-contract.overlay.json'), overlayText);
}

function writeSessionFiles(projectDir, sessionFilesText) {
  const sessionFilePath = path.join(
    os.tmpdir(),
    `claude-session-files-${Buffer.from(projectDir).toString('base64url')}.json`
  );
  fs.writeFileSync(sessionFilePath, sessionFilesText);
  return sessionFilePath;
}

function sessionIdFromJsonl(jsonlText) {
  if (!jsonlText) return 'empty-session';
  const firstLine = jsonlText.split('\n').find(Boolean);
  if (!firstLine) return 'empty-session';
  try {
    const record = JSON.parse(firstLine);
    return record.session || 'empty-session';
  } catch {
    return 'empty-session';
  }
}

function runFixture(name) {
  const sessionJsonl = readOptional(path.join(FIXTURE_DIR, `${name}.session.jsonl`)) || '';
  const matrixText = readOptional(path.join(FIXTURE_DIR, `${name}.matrix.json`));
  const overlayText = readOptional(path.join(FIXTURE_DIR, `${name}.overlay.json`));
  const sessionFilesText =
    readOptional(path.join(FIXTURE_DIR, `${name}.sessionfiles.json`)) ||
    '{"files":[]}';
  const expectedText = readOptional(path.join(FIXTURE_DIR, `${name}.expected.json`));
  if (!expectedText) {
    return { name, pass: false, reason: 'missing .expected.json' };
  }
  const expected = JSON.parse(expectedText);
  const sessionId = sessionIdFromJsonl(sessionJsonl);

  const projectDir = mkTmpProject();
  let sessionFilePath;
  try {
    if (matrixText) writeMatrix(projectDir, matrixText);
    if (overlayText) writeOverlay(projectDir, overlayText);
    writeEvidenceLog(projectDir, sessionId, sessionJsonl);
    sessionFilePath = writeSessionFiles(projectDir, sessionFilesText);

    const result = spawnSync(process.execPath, [HOOK_PATH], {
      input: JSON.stringify({ session_id: sessionId }),
      env: {
        ...process.env,
        HOOK_TEST_PROJECT_ROOT: projectDir,
        HOOK_SKIP_PLAYWRIGHT_SETUP: '1',
      },
      encoding: 'utf8',
      timeout: 30000,
    });

    const stdout = (result.stdout || '').trim();
    const stderr = (result.stderr || '').trim();
    const exitCode = result.status;

    if (expected.exitCode === 0 && expected.stdoutEmpty) {
      if (exitCode !== 0 || stdout !== '') {
        return {
          name,
          pass: false,
          reason: `expected exit 0 + empty stdout; got exit ${exitCode}, stdout="${stdout.slice(0, 200)}"`,
          stderr,
        };
      }
      return { name, pass: true };
    }

    if (expected.decision === 'block') {
      if (!stdout) {
        return { name, pass: false, reason: 'expected stdout JSON block but got nothing', stderr };
      }
      let parsed;
      try {
        parsed = JSON.parse(stdout);
      } catch {
        return { name, pass: false, reason: `stdout not valid JSON: ${stdout.slice(0, 200)}` };
      }
      if (parsed.decision !== 'block') {
        return { name, pass: false, reason: `decision=${parsed.decision} (expected block)` };
      }
      const reasonText = String(parsed.reason || '');
      for (const needle of expected.reasonContains || []) {
        if (!reasonText.includes(needle)) {
          return {
            name,
            pass: false,
            reason: `reason missing "${needle}"; got:\n${reasonText.slice(0, 400)}`,
          };
        }
      }
      return { name, pass: true };
    }

    return { name, pass: false, reason: 'unsupported expected.json shape' };
  } finally {
    try {
      if (sessionFilePath) fs.unlinkSync(sessionFilePath);
    } catch {}
    try {
      fs.rmSync(projectDir, { recursive: true, force: true });
    } catch {}
  }
}

function main() {
  const only = process.argv.slice(2);
  const fixtures = listFixtures().filter((name) =>
    only.length === 0 ? true : only.some((arg) => name.includes(arg))
  );
  if (fixtures.length === 0) {
    console.log('no fixtures found');
    process.exit(1);
  }
  let pass = 0;
  let fail = 0;
  for (const name of fixtures) {
    const result = runFixture(name);
    if (result.pass) {
      console.log(`  PASS  ${name}`);
      pass++;
    } else {
      console.log(`  FAIL  ${name}`);
      console.log(`        ${result.reason}`);
      if (result.stderr) console.log(`        stderr: ${result.stderr.slice(0, 200)}`);
      fail++;
    }
  }
  console.log(`\n${pass}/${pass + fail} fixtures passed`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
