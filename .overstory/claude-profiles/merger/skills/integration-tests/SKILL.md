---
name: integration-tests
description: Integration test patterns for API modules and frontend features. Use when creating or modifying any API module, controller, frontend feature with data layer, or cross-module interaction. Covers supertest + NestJS TestingModule for backend and MSW + Testing Library for frontend.
---

# Integration Tests

You MUST write both unit tests (mocked deps) and integration tests (wired together).

## WARNING: integration tests do not prove HTTP works

NestJS `Test.createTestingModule` (in-process, no port) and MSW (mocks HTTP at client) do NOT prove:

- Server boots with real module graph.
- Routes registered on real HTTP listener.
- Middleware runs in real request pipeline.
- CORS / helmet / throttle config allows real requests.
- Client can reach API at configured base URL.
- Auth cookies / tokens traverse real origin boundary.

**Runtime verification (see `runtime-verification` section of builder.md) is the gate that proves those things.**

**A passing integration suite with a failing runtime probe = failing feature.**

---

## When to Write Integration Tests

- Every **API module** you create or modify (controllers, services, repositories)
- Every **frontend feature** with a `data/` layer (hooks, repositories, API calls)
- Every **cross-module interaction** (e.g., Task depends on Project)
- Every **auth-protected endpoint** (test with and without token)
- Every **validation flow** (bad input rejected at HTTP layer with correct error shape)

---

## File Location

```
# API — one __integration__ dir per module
apps/api/src/modules/task/__integration__/
  task.integration-test.ts              # Full CRUD
  task-label.integration-test.ts        # Cross-module: Task + Label

# Frontend — one __integration__ dir per feature
apps/web/src/features/task/__integration__/
  task-list.integration-test.ts         # Hook → repo → API → state
  task-create.integration-test.tsx      # Form → submit → API → redirect
```

Use `.integration-test.ts` suffix. Run via `pnpm test:integration`.

---

## API Integration Tests (NestJS + supertest)

Import the REAL module. No mocks.

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../../app.module';

describe('Task Module (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule], // REAL module — no mocks
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/v1/tasks', () => {
    it('creates a task and returns 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/tasks')
        .send({ title: 'Integration test task', projectId: 'proj-1' })
        .expect(201);

      expect(res.body).toMatchObject({
        id: expect.any(String),
        title: 'Integration test task',
      });
    });

    it('returns 400 when required fields are missing', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/tasks')
        .send({})
        .expect(400);
    });
  });

  describe('GET /api/v1/tasks/:id', () => {
    it('roundtrip: create then fetch returns same data', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/tasks')
        .send({ title: 'Roundtrip', projectId: 'proj-1' })
        .expect(201);

      const fetched = await request(app.getHttpServer())
        .get(`/api/v1/tasks/${created.body.id}`)
        .expect(200);

      expect(fetched.body.title).toBe('Roundtrip');
    });

    it('returns 404 for non-existent id', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/tasks/does-not-exist')
        .expect(404);
    });
  });

  describe('DELETE /api/v1/tasks/:id', () => {
    it('deletes then GET returns 404', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/tasks')
        .send({ title: 'To delete', projectId: 'proj-1' })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/api/v1/tasks/${created.body.id}`)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/api/v1/tasks/${created.body.id}`)
        .expect(404);
    });
  });
});
```

### API integration test checklist

| Scenario | What it proves |
|----------|---------------|
| POST valid → 201 | Controller → Service → Repository → DB → Response |
| POST invalid → 400 | Validation rejects bad input before service |
| GET after POST → same data | Full roundtrip through all layers |
| GET non-existent → 404 | Error propagation from repo to HTTP |
| DELETE then GET → 404 | Delete actually removes data |
| Without auth token → 401 | Guard rejects unauthenticated |
| Cross-module: Task + Label | Multiple modules wired correctly |

---

## Frontend Integration Tests (MSW + Testing Library)

Test full data flow: hook → repository → HTTP call → mapper → UI state. Use MSW to intercept real HTTP calls at network level — NOT mocked repositories.

```typescript
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useTaskList } from '../presentation/hooks/useTaskList';

// MSW server intercepts real fetch calls
const server = setupServer(
  http.get('/api/v1/tasks', () => {
    return HttpResponse.json([
      { id: '1', title: 'Task One', status: 'open' },
      { id: '2', title: 'Task Two', status: 'done' },
    ]);
  })
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('Task list feature (integration)', () => {
  it('fetches tasks and maps to UI model', async () => {
    const { result } = renderHook(() => useTaskList('proj-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.tasks).toHaveLength(2));
    expect(result.current.tasks[0].title).toBe('Task One');
  });

  it('handles API error gracefully', async () => {
    server.use(
      http.get('/api/v1/tasks', () => {
        return HttpResponse.json({ message: 'Server error' }, { status: 500 });
      })
    );

    const { result } = renderHook(() => useTaskList('proj-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.error).toBeTruthy());
  });

  it('shows empty state when no tasks', async () => {
    server.use(
      http.get('/api/v1/tasks', () => {
        return HttpResponse.json([]);
      })
    );

    const { result } = renderHook(() => useTaskList('proj-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.tasks).toHaveLength(0));
  });
});
```

### Frontend integration test checklist

| Scenario | What it proves |
|----------|---------------|
| Fetch → data in hook state | Hook → repo → API → mapper → state works |
| API 500 → error state | Error propagation from network to UI |
| Empty response → empty state | Edge case handling through all layers |
| Create → optimistic update | Mutation → API call → cache invalidation |
| Form submit → API call → redirect | Full user flow through data pipeline |

---

## Rules

1. **No mocking internal layers** — mock only external boundaries (MSW for frontend HTTP, nothing for API)
2. **Test the flow, not the unit** — a single test should cross multiple layers
3. **Test roundtrips** — create then read back, proves write + read both work
4. **Test all error codes** — 400, 401, 404, 409, 500 are all required
5. **Clean up test data** — tests must not depend on each other
6. **Test cross-module/feature interactions** — when features depend on each other, test them together

## Anti-Patterns (Do NOT Do)

- Mocking the service/repository — that is a unit test, not an integration test
- Only testing happy path — error paths catch more bugs
- No roundtrip — create without verifying read proves nothing
- Testing implementation details — test the contract (HTTP/state), not internal calls
