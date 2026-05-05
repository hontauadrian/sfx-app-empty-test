'use strict';

/**
 * lib/sse.js — Server-Sent Events parser for probe streaming assertions.
 *
 * Implements the EventSource wire protocol (data:, event:, id:, retry:)
 * as both a synchronous parser for buffered text and an async collector
 * for streamed responses. No external deps.
 */

/**
 * @typedef {Object} SSEEvent
 * @property {string} data - Event data (multi-line data: fields joined with \n)
 * @property {string} [event] - Event type (defaults to 'message')
 * @property {string} [id] - Last event ID
 * @property {number} [retry] - Reconnection time in ms
 */

/**
 * Parse a complete SSE text blob into an array of events.
 * Events are separated by blank lines. Each field is `field: value\n`.
 * @param {string} text - Raw SSE text (may include multiple events)
 * @returns {SSEEvent[]}
 */
function parseSSEText(text) {
  if (!text || typeof text !== 'string') return [];

  const events = [];
  let current = null;

  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    // Blank line = dispatch current event
    if (line === '') {
      if (current && current.data !== undefined) {
        events.push(finalizeEvent(current));
      }
      current = null;
      continue;
    }

    // Comment lines (start with ':') are ignored
    if (line.startsWith(':')) continue;

    if (!current) current = {};

    const colonIdx = line.indexOf(':');
    let field, value;
    if (colonIdx === -1) {
      field = line;
      value = '';
    } else {
      field = line.slice(0, colonIdx);
      value = line.slice(colonIdx + 1);
      // Strip single leading space after colon per spec
      if (value.startsWith(' ')) value = value.slice(1);
    }

    switch (field) {
      case 'data':
        current.data = current.data !== undefined
          ? current.data + '\n' + value
          : value;
        break;
      case 'event':
        current.event = value;
        break;
      case 'id':
        current.id = value;
        break;
      case 'retry': {
        const n = parseInt(value, 10);
        if (Number.isFinite(n) && n >= 0) current.retry = n;
        break;
      }
      default:
        // Unknown fields are ignored per spec
        break;
    }
  }

  // Handle trailing event without final blank line
  if (current && current.data !== undefined) {
    events.push(finalizeEvent(current));
  }

  return events;
}

function finalizeEvent(raw) {
  const event = { data: raw.data || '' };
  if (raw.event) event.event = raw.event;
  if (raw.id !== undefined) event.id = raw.id;
  if (raw.retry !== undefined) event.retry = raw.retry;
  return event;
}

/**
 * Collect SSE events from a fetch Response stream, stopping after `maxEvents`
 * or `timeoutMs`, whichever comes first.
 *
 * @param {Response} response - A fetch Response with streaming body
 * @param {{ maxEvents?: number, timeoutMs?: number }} [opts]
 * @returns {Promise<{ events: SSEEvent[], truncated: boolean, error: string|null }>}
 */
async function collectSSEEvents(response, opts = {}) {
  const maxEvents = opts.maxEvents ?? 10;
  const timeoutMs = opts.timeoutMs ?? 5000;

  const events = [];
  let truncated = false;
  let error = null;

  try {
    const body = response.body;
    if (!body) {
      return { events: [], truncated: false, error: 'No response body' };
    }

    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const deadline = Date.now() + timeoutMs;

    while (events.length < maxEvents) {
      if (Date.now() > deadline) {
        truncated = true;
        break;
      }

      const remaining = deadline - Date.now();
      const readPromise = reader.read();
      const timeoutPromise = new Promise((resolve) =>
        setTimeout(() => resolve({ done: true, value: undefined, timedOut: true }), remaining)
      );

      const result = await Promise.race([readPromise, timeoutPromise]);

      if (result.timedOut) {
        truncated = true;
        reader.cancel().catch(() => {});
        break;
      }

      if (result.done) break;

      buffer += decoder.decode(result.value, { stream: true });

      // Parse complete events from buffer (separated by double newline)
      const parts = buffer.split(/\n\n/);
      // Keep last part as incomplete buffer
      buffer = parts.pop() || '';

      for (const part of parts) {
        if (!part.trim()) continue;
        const parsed = parseSSEText(part + '\n\n');
        for (const evt of parsed) {
          events.push(evt);
          if (events.length >= maxEvents) {
            truncated = true;
            break;
          }
        }
        if (events.length >= maxEvents) break;
      }
    }

    // Try to cancel the reader if we stopped early
    if (truncated) {
      reader.cancel().catch(() => {});
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return { events, truncated, error };
}

/**
 * Validate that an SSE event has the expected shape.
 * @param {SSEEvent} event
 * @returns {{ valid: boolean, issues: string[] }}
 */
function validateSSEEvent(event) {
  const issues = [];
  if (event.data === undefined || event.data === null) {
    issues.push('Missing data field');
  }
  if (typeof event.data !== 'string') {
    issues.push(`data field is ${typeof event.data}, expected string`);
  }
  return { valid: issues.length === 0, issues };
}

module.exports = {
  parseSSEText,
  collectSSEEvents,
  validateSSEEvent,
};
