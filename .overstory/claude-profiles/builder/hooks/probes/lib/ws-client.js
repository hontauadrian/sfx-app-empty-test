'use strict';

/**
 * lib/ws-client.js — WebSocket client for probe assertions.
 *
 * Uses the `ws` npm package if available; warns and returns a no-op stub if
 * absent. Provides connect/send/expect/close primitives consumed by
 * assertion-library.ts ws-* step kinds.
 *
 * No other external deps. Timeout-guarded throughout.
 */

const WS_DEFAULT_TIMEOUT_MS = 5000;

let WebSocketImpl = null;

try {
  WebSocketImpl = require('ws');
} catch {
  // ws not installed — stub mode
}

/**
 * Check if the ws library is available.
 * @returns {boolean}
 */
function isAvailable() {
  return WebSocketImpl !== null;
}

/**
 * Build the connect URL for the given transport.
 *
 * @param {string} baseUrl - ws:// or wss:// URL (e.g. ws://127.0.0.1:3001/ws)
 * @param {string} transport - 'ws' | 'socket.io' | 'graphql-ws'
 * @returns {string}
 */
function buildConnectUrl(baseUrl, transport) {
  if (transport === 'socket.io') {
    // Engine.IO v4 websocket-only upgrade URL
    const sep = baseUrl.endsWith('/') ? '' : '/';
    return `${baseUrl}${sep}socket.io/?EIO=4&transport=websocket`;
  }
  return baseUrl;
}

/**
 * Connect to a WebSocket endpoint.
 *
 * For socket.io transport, performs Engine.IO + Socket.IO handshake:
 *   1. Opens raw WS to /socket.io/?EIO=4&transport=websocket
 *   2. Waits for Engine.IO OPEN packet (type 0)
 *   3. Sends Socket.IO CONNECT to namespace
 *   4. Waits for Socket.IO CONNECT ACK
 *
 * @param {string} url - Full ws:// or wss:// URL
 * @param {{ timeoutMs?: number, protocols?: string|string[], headers?: Record<string,string>, transport?: string, namespace?: string }} [opts]
 * @returns {Promise<{ ws: object, error: string|null }>}
 */
function connect(url, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? WS_DEFAULT_TIMEOUT_MS;
  const transport = opts.transport ?? 'ws';
  const namespace = opts.namespace ?? '/';

  if (!WebSocketImpl) {
    return Promise.resolve({
      ws: null,
      error: 'ws library not installed — skip WebSocket probes',
    });
  }

  const connectUrl = buildConnectUrl(url, transport);

  return new Promise((resolve) => {
    const wsOpts = {};
    if (opts.headers) wsOpts.headers = opts.headers;

    let ws;
    try {
      ws = new WebSocketImpl(connectUrl, opts.protocols || [], wsOpts);
    } catch (err) {
      return resolve({ ws: null, error: err.message });
    }

    const timer = setTimeout(() => {
      ws.terminate();
      resolve({ ws: null, error: `WebSocket connect timeout after ${timeoutMs}ms` });
    }, timeoutMs);

    if (transport === 'socket.io') {
      // Engine.IO + Socket.IO handshake
      let handshakePhase = 'engine-open'; // engine-open -> sio-connect -> done

      ws.on('open', () => {
        if (process.env.WS_CLIENT_DEBUG) {
          process.stderr.write(`[ws-client] socket.io raw WS open\n`);
        }
      });

      ws.on('message', (raw) => {
        const msg = typeof raw === 'string' ? raw : raw.toString();
        if (process.env.WS_CLIENT_DEBUG) {
          process.stderr.write(`[ws-client] socket.io msg phase=${handshakePhase}: ${msg.slice(0, 200)}\n`);
        }

        if (handshakePhase === 'engine-open') {
          // Engine.IO OPEN packet starts with '0'
          if (msg.startsWith('0')) {
            handshakePhase = 'sio-connect';
            // Send Socket.IO CONNECT packet to namespace
            const nsPayload = namespace === '/' ? '40' : `40${namespace},`;
            ws.send(nsPayload);
          }
        } else if (handshakePhase === 'sio-connect') {
          // Socket.IO CONNECT ACK: '40' (default ns) or '40/ns,' (custom ns)
          if (msg.startsWith('40')) {
            handshakePhase = 'done';
            clearTimeout(timer);
            // Tag the ws with transport metadata for send/expect
            ws._sioTransport = true;
            ws._sioNamespace = namespace;
            resolve({ ws, error: null });
          } else if (msg.startsWith('44')) {
            // Socket.IO CONNECT_ERROR
            clearTimeout(timer);
            ws.terminate();
            resolve({ ws: null, error: `Socket.IO connect error: ${msg.slice(2)}` });
          }
        }
      });

      ws.on('error', (err) => {
        clearTimeout(timer);
        resolve({ ws: null, error: err.message });
      });
    } else {
      // Plain WS or graphql-ws — connect on open
      ws.on('open', () => {
        clearTimeout(timer);
        resolve({ ws, error: null });
      });

      ws.on('error', (err) => {
        clearTimeout(timer);
        resolve({ ws: null, error: err.message });
      });
    }
  });
}

/**
 * Send a message on an open WebSocket.
 *
 * For socket.io transport, wraps as Engine.IO MESSAGE + Socket.IO EVENT:
 *   42/namespace,["eventName", data]
 *
 * @param {object} ws - WebSocket instance from connect()
 * @param {string|object} data - Message to send (objects are JSON-stringified)
 * @param {{ event?: string }} [opts] - Options (event name for socket.io)
 * @returns {Promise<{ error: string|null }>}
 */
function send(ws, data, opts = {}) {
  return new Promise((resolve) => {
    if (!ws || ws.readyState !== 1 /* OPEN */) {
      return resolve({ error: 'WebSocket not open' });
    }

    let payload;
    if (ws._sioTransport) {
      // Socket.IO EVENT packet: 42/namespace,["event", data]
      const event = opts.event || 'message';
      const ns = ws._sioNamespace || '/';
      const nsPrefix = ns === '/' ? '' : `${ns},`;
      payload = `42${nsPrefix}${JSON.stringify([event, data])}`;
    } else {
      payload = typeof data === 'string' ? data : JSON.stringify(data);
    }

    ws.send(payload, (err) => {
      resolve({ error: err ? err.message : null });
    });
  });
}

/**
 * Wait for a specific event/message on a WebSocket.
 *
 * For socket.io protocol, messages are JSON arrays: [eventName, ...args].
 * For raw WS, any message is accepted.
 *
 * @param {object} ws - WebSocket instance
 * @param {{ eventName?: string, timeoutMs?: number, maxMessages?: number }} [opts]
 * @returns {Promise<{ messages: Array<{raw: string, parsed: unknown}>, matched: boolean, error: string|null }>}
 */
function expectEvent(ws, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? WS_DEFAULT_TIMEOUT_MS;
  const maxMessages = opts.maxMessages ?? 10;
  const eventName = opts.eventName ?? null;

  return new Promise((resolve) => {
    if (!ws || ws.readyState !== 1) {
      return resolve({ messages: [], matched: false, error: 'WebSocket not open' });
    }

    const messages = [];
    let matched = false;

    const timer = setTimeout(() => {
      cleanup();
      resolve({ messages, matched, error: matched ? null : `Timeout after ${timeoutMs}ms waiting for event` });
    }, timeoutMs);

    const onMessage = (raw) => {
      const rawStr = typeof raw === 'string' ? raw : raw.toString();

      // For Socket.IO connections, decode Engine.IO/Socket.IO framing
      if (ws._sioTransport) {
        // Skip Engine.IO PING (2) / PONG (3) packets
        if (rawStr === '2' || rawStr === '3') return;
        // Socket.IO EVENT packet: 42/namespace,["eventName", data]
        if (rawStr.startsWith('42')) {
          let jsonPart = rawStr.slice(2);
          // Strip namespace prefix if present
          const ns = ws._sioNamespace || '/';
          if (ns !== '/') {
            const nsPrefix = `${ns},`;
            if (jsonPart.startsWith(nsPrefix)) {
              jsonPart = jsonPart.slice(nsPrefix.length);
            }
          }
          let sioPayload;
          try { sioPayload = JSON.parse(jsonPart); } catch { return; }
          if (Array.isArray(sioPayload) && sioPayload.length >= 1) {
            const sioEvent = sioPayload[0];
            const sioData = sioPayload.length > 1 ? sioPayload[1] : undefined;
            messages.push({ raw: rawStr, parsed: { event: sioEvent, data: sioData } });
            if (eventName && sioEvent === eventName) matched = true;
            else if (!eventName) matched = true;
          }
        }
        // Ignore other Socket.IO packet types (40=CONNECT, 41=DISCONNECT, etc.)
      } else {
        let parsed = rawStr;
        try { parsed = JSON.parse(rawStr); } catch { /* not JSON */ }

        messages.push({ raw: rawStr, parsed });

        if (eventName) {
          if (Array.isArray(parsed) && parsed[0] === eventName) {
            matched = true;
          } else if (typeof parsed === 'object' && parsed !== null && parsed.event === eventName) {
            matched = true;
          }
        } else {
          matched = true;
        }
      }

      if (matched || messages.length >= maxMessages) {
        cleanup();
        resolve({ messages, matched, error: null });
      }
    };

    const onClose = () => {
      cleanup();
      resolve({ messages, matched, error: 'WebSocket closed before event received' });
    };

    const onError = (err) => {
      cleanup();
      resolve({ messages, matched, error: err.message });
    };

    function cleanup() {
      clearTimeout(timer);
      ws.removeListener('message', onMessage);
      ws.removeListener('close', onClose);
      ws.removeListener('error', onError);
    }

    ws.on('message', onMessage);
    ws.on('close', onClose);
    ws.on('error', onError);
  });
}

/**
 * Close a WebSocket connection gracefully.
 *
 * @param {object} ws - WebSocket instance
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {Promise<{ error: string|null }>}
 */
function close(ws, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 2000;

  return new Promise((resolve) => {
    if (!ws) return resolve({ error: null });

    if (ws.readyState === 3 /* CLOSED */) {
      return resolve({ error: null });
    }

    const timer = setTimeout(() => {
      ws.terminate();
      resolve({ error: null });
    }, timeoutMs);

    ws.on('close', () => {
      clearTimeout(timer);
      resolve({ error: null });
    });

    try {
      ws.close();
    } catch {
      clearTimeout(timer);
      ws.terminate();
      resolve({ error: null });
    }
  });
}

module.exports = {
  isAvailable,
  connect,
  send,
  expectEvent,
  close,
  WS_DEFAULT_TIMEOUT_MS,
};
