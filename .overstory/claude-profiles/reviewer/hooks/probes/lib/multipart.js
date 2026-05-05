'use strict';

/**
 * lib/multipart.js — FormData builder helpers for probe uploads.
 *
 * Builds Node-native FormData with synthetic file payloads for testing
 * multipart/form-data endpoints. No external deps.
 */

/**
 * Known MIME-to-magic-bytes map for generating recognisable sample files.
 * The probe download assertions use the same map to verify magic bytes.
 */
const MAGIC_BYTES = {
  'image/png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  'application/pdf': Buffer.from('%PDF-1.4\n'),
  'image/jpeg': Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  'image/gif': Buffer.from('GIF89a'),
  'image/webp': Buffer.from('RIFF\x00\x00\x00\x00WEBP'),
  'application/zip': Buffer.from([0x50, 0x4b, 0x03, 0x04]),
};

/**
 * Generate a synthetic file buffer with correct magic bytes for a given MIME.
 * @param {string} mimeType - The desired MIME type
 * @param {number} [sizeBytes=128] - Desired total file size (padded with zeros)
 * @returns {{ buffer: Buffer, filename: string, mimeType: string }}
 */
function generateSampleFile(mimeType, sizeBytes = 128) {
  const magic = MAGIC_BYTES[mimeType] || Buffer.from('PROBE');
  const padLen = Math.max(0, sizeBytes - magic.length);
  const buffer = Buffer.concat([magic, Buffer.alloc(padLen)]);

  const ext = mimeToExtension(mimeType);
  const filename = `probe-sample${ext}`;

  return { buffer, filename, mimeType };
}

/**
 * Build a FormData instance with a file field.
 * @param {string} fieldName - Form field name (e.g. 'file', 'avatar')
 * @param {{ buffer: Buffer, filename: string, mimeType: string }} file
 * @param {Record<string, string>} [extraFields] - Additional text fields
 * @returns {FormData}
 */
function buildFormData(fieldName, file, extraFields) {
  const form = new FormData();
  const blob = new Blob([file.buffer], { type: file.mimeType });
  form.append(fieldName, blob, file.filename);
  if (extraFields) {
    for (const [key, value] of Object.entries(extraFields)) {
      form.append(key, value);
    }
  }
  return form;
}

/**
 * Build an oversized FormData for testing 413 rejection.
 * @param {string} fieldName
 * @param {string} mimeType
 * @param {number} sizeBytes - Size that should exceed the server limit
 * @returns {FormData}
 */
function buildOversizedFormData(fieldName, mimeType, sizeBytes) {
  const file = generateSampleFile(mimeType, sizeBytes);
  return buildFormData(fieldName, file);
}

/**
 * Build a FormData with wrong MIME type for testing 415 rejection.
 * @param {string} fieldName
 * @param {string} wrongMimeType - MIME type the server should reject
 * @returns {FormData}
 */
function buildWrongMimeFormData(fieldName, wrongMimeType) {
  const file = generateSampleFile(wrongMimeType, 64);
  return buildFormData(fieldName, file);
}

function mimeToExtension(mimeType) {
  const map = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'application/pdf': '.pdf',
    'application/zip': '.zip',
    'application/octet-stream': '.bin',
    'text/plain': '.txt',
  };
  return map[mimeType] || '.bin';
}

module.exports = {
  MAGIC_BYTES,
  generateSampleFile,
  buildFormData,
  buildOversizedFormData,
  buildWrongMimeFormData,
  mimeToExtension,
};
