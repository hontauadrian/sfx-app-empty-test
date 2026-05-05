'use strict';

const fs = require('fs');
const path = require('path');

// Diagnostic aggregator — collects warnings/infos/errors, flushes
// to stderr (verbose) and a log file. Spec: plan 02 §3.
function createDiag(verbose, logPath) {
  const entries = [];
  const detectorErrors = [];

  function push(level, message, meta) {
    const entry = { level, message, time: new Date().toISOString() };
    if (meta) entry.meta = meta;
    entries.push(entry);
    if (verbose) {
      try {
        process.stderr.write(`[derive-test-matrix] ${level}: ${message}\n`);
      } catch (writeErr) {
        void writeErr;
      }
    }
  }

  return {
    info(message, meta) { push('info', message, meta); },
    warn(message, meta) { push('warn', message, meta); },
    error(message, meta) { push('error', message, meta); },
    recordDetectorError(detector, error) {
      const record = {
        detector,
        message: error && error.message ? error.message : String(error),
      };
      detectorErrors.push(record);
      push('warn', `detector:${detector} failed: ${record.message}`);
    },
    getDetectorErrors() { return detectorErrors.slice(); },
    entries() { return entries.slice(); },
    flush() {
      if (!logPath) return;
      try {
        fs.mkdirSync(path.dirname(logPath), { recursive: true });
        fs.writeFileSync(logPath, entries.map((entry) => JSON.stringify(entry)).join('\n') + '\n');
      } catch (writeErr) {
        void writeErr;
      }
    },
  };
}

module.exports = { createDiag };
