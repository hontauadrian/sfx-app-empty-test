# WebSocket / Socket.IO

## When to use this pattern

Real-time bi-directional features: chat, presence, live cursors, server
push notifications, collaborative editing. Use a WebSocket gateway when
SSE (one-way server-to-client) is insufficient.

## How to declare it (so the probe verifies it)

The probe's `detectors/websocket.js` scans for NestJS WebSocket gateway
classes:

- A class decorated with `@WebSocketGateway(...)`. **Multiple gateway
  classes per file are supported** — each `@WebSocketGateway` block
  is parsed independently.
- Method decorators `@SubscribeMessage('eventName')` to register event
  handlers.
- The first argument's type to extract a parameter schema (used to
  generate sample payloads).
- Class-level `@UseGuards(...)` — when present, the gateway requires
  authentication on the WebSocket handshake. The probe emits an
  additional `:no-auth` flow to verify unauthorised connections are
  rejected.

If two gateways declare the same `path` AND the same `namespace`, the
detector emits `WS_NAMESPACE_AMBIGUOUS` — declare distinct
namespaces or merge the gateways.

The detector emits `matrix.websocketGateways.gateways[i]`:

```
{
  file: 'apps/api/src/modules/chat/chat.gateway.ts',
  path: '/socket.io',          // from @WebSocketGateway({ path: ... })
  namespace: '/chat',          // from @WebSocketGateway({ namespace: ... })
  transport: 'socket.io',      // 'ws' or 'socket.io'
  events: [
    { name: 'message', paramSchema: { typeName: 'string' } },
    { name: 'typing', paramSchema: { typeName: 'object' } },
  ],
}
```

## Code template

```ts
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  path: '/socket.io',
  namespace: '/chat',
  cors: { origin: '*' },
})
export class ChatGateway {
  @WebSocketServer()
  server: Server;

  @SubscribeMessage('message')
  handleMessage(
    @MessageBody() payload: string,
    @ConnectedSocket() client: Socket,
  ): { ack: boolean; echo: string } {
    this.server.emit('message', payload);
    return { ack: true, echo: payload };
  }

  @SubscribeMessage('typing')
  handleTyping(@MessageBody() data: { userId: string }) {
    this.server.emit('typing', data);
    return { ok: true };
  }
}
```

Register the gateway in the module:

```ts
@Module({ providers: [ChatGateway] })
export class ChatModule {}
```

For raw `ws` transport instead of Socket.IO, install
`@nestjs/platform-ws` and use `WsAdapter`. The detector reads the
adapter setup in `apps/api/src/main.ts` to choose `transport`.

## What the probe will assert (when present)

Per gateway:

- `ws:<path>:connect` — open a WebSocket connection to the gateway path
  → expect successful handshake → close cleanly.

Per `@SubscribeMessage('eventName')` event:

- `ws:<path>:event:<eventName>:subscribe` — connect → emit the event
  with a sample payload → wait up to 3 s for any reply event → close.
  The reply may be an ack callback or a server-emitted event.
- `ws:<path>:event:<eventName>:disconnect` — connect → emit event →
  close mid-stream → assert no error / no leaked listener.

Per gateway with `@UseGuards(...)` at the class level:

- `ws:<path>:no-auth` — open connection WITHOUT auth credentials
  (no `auth` payload, no `Authorization` header) → expect connection
  rejection (Socket.IO `connect_error` or `ws` close before
  handshake completes). Verifies the guard runs at handshake.

Sample payload generation uses the first parameter's TypeScript type:
`string` → `'probe-sample'`, `number` → `42`, `boolean` → `true`,
otherwise `{ probe: true }`.

## Anti-patterns the probe will surface as drift

- Throwing inside `@SubscribeMessage` without a try/catch — Socket.IO
  emits an `error` packet but no ack; the probe times out and reports
  the event as broken.
- Not returning anything (or returning `void`) when a client uses ack
  callback — the client hangs; the probe's `ws-expect-event` times out.
- Mounting the gateway under a different `path` than declared in
  `@WebSocketGateway({ path })` — connection refused.
- Using a custom adapter without registering it in `main.ts` —
  detector defaults to `ws` transport but real server uses Socket.IO,
  so the handshake mismatches.
- Declaring `@UseGuards` at the gateway class level but the guard
  only checks credentials inside `@SubscribeMessage` handlers, not
  on `handleConnection` — `:no-auth` flow connects successfully
  (drift). Move auth into the connection handshake so unauthenticated
  sockets are rejected before any event is processed.
- Two gateways in the same file declaring the same `path` +
  `namespace` — the second silently overrides the first, or both
  conflict at runtime. Detector emits `WS_NAMESPACE_AMBIGUOUS`.

## Source of truth the probe scans

- `apps/api/src/**/*.gateway.ts` and `apps/api/src/**/*.ts` — any file
  containing `@WebSocketGateway`.
- The decorator argument literal — `path`, `namespace`, `cors`.
- `@SubscribeMessage('name')` decorators — event names.
- The handler's first parameter type — used by `buildSampleDataForEvent`
  to synthesise a payload.
- `apps/api/src/main.ts` — `useWebSocketAdapter(...)` to pick `ws` vs
  `socket.io` transport.
