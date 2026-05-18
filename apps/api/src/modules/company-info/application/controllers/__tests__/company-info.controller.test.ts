import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { Mock } from 'vitest';
import { vi } from 'vitest';
import type {
  CompanyInfo,
  CompanyInfoRepository,
  CompanyInfoVersion,
  UpsertCompanyInfoInput,
} from '@sfx/domain';
import type { RequestWithAuthenticatedUser } from '../../../../../common/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../../../../../common/auth/auth-token.service';
import { CompanyInfoController } from '../company-info.controller';

const fixedDate = new Date('2026-01-02T03:04:05.000Z');

const buildPersistedRecord = (overrides: Partial<CompanyInfo> = {}): CompanyInfo => ({
  id: 'cuid-1',
  legalName: 'Acme Holdings SRL',
  tradingName: null,
  email: null,
  phone: null,
  website: null,
  addressLine1: null,
  addressLine2: null,
  city: null,
  postalCode: null,
  country: null,
  taxId: null,
  registrationNumber: null,
  companyName: null,
  foundedYear: null,
  teamSize: null,
  industry: null,
  missionStatement: null,
  visionStatement: null,
  coreValues: [],
  certifications: [],
  createdAt: fixedDate,
  updatedAt: fixedDate,
  ...overrides,
});

const buildVersion = (overrides: Partial<CompanyInfoVersion> = {}): CompanyInfoVersion => ({
  id: 'v-1',
  companyInfoId: 'cuid-1',
  snapshot: buildPersistedRecord(),
  editorUserId: 'subject-admin',
  editorDisplayName: 'admin@example.test',
  createdAt: new Date('2026-02-01T00:00:00.000Z'),
  ...overrides,
});

const makeRepoStub = (): {
  repo: CompanyInfoRepository;
  findSingleton: Mock;
  upsertSingleton: Mock;
  listVersions: Mock;
  findVersionById: Mock;
} => {
  const findSingleton = vi.fn();
  const upsertSingleton = vi.fn();
  const listVersions = vi.fn();
  const findVersionById = vi.fn();
  const repo: CompanyInfoRepository = {
    findSingleton,
    upsertSingleton,
    listVersions,
    findVersionById,
  };
  return { repo, findSingleton, upsertSingleton, listVersions, findVersionById };
};

const buildRequest = (user: AuthenticatedUser | undefined): RequestWithAuthenticatedUser =>
  ({ user } as unknown as RequestWithAuthenticatedUser);

describe('CompanyInfoController.getCompanyInfo', () => {
  it('returns null when the repository resolves null', async () => {
    const { repo, findSingleton } = makeRepoStub();
    findSingleton.mockResolvedValue(null);

    const controller = new CompanyInfoController(repo);

    await expect(controller.getCompanyInfo()).resolves.toBeNull();
    expect(findSingleton).toHaveBeenCalledTimes(1);
  });

  it('returns the persisted record when the repository resolves one', async () => {
    const persisted = buildPersistedRecord({ legalName: 'Globex' });
    const { repo, findSingleton } = makeRepoStub();
    findSingleton.mockResolvedValue(persisted);

    const controller = new CompanyInfoController(repo);

    await expect(controller.getCompanyInfo()).resolves.toEqual(persisted);
  });

  it('propagates repository errors', async () => {
    const { repo, findSingleton } = makeRepoStub();
    findSingleton.mockRejectedValue(new Error('db down'));

    const controller = new CompanyInfoController(repo);

    await expect(controller.getCompanyInfo()).rejects.toThrow('db down');
  });
});

describe('CompanyInfoController.upsertCompanyInfo', () => {
  it('passes editor.editorUserId = req.user.subject and editorDisplayName = req.user.email', async () => {
    const persisted = buildPersistedRecord({ legalName: 'New Co' });
    const { repo, upsertSingleton } = makeRepoStub();
    upsertSingleton.mockResolvedValue(persisted);

    const controller = new CompanyInfoController(repo);
    const input: UpsertCompanyInfoInput = { legalName: 'New Co' };
    const req = buildRequest({
      subject: 'subject-admin',
      email: 'admin@example.test',
      roles: ['admin'],
    });

    await expect(controller.upsertCompanyInfo(input, req)).resolves.toEqual(persisted);

    expect(upsertSingleton).toHaveBeenCalledTimes(1);
    expect(upsertSingleton).toHaveBeenCalledWith(input, {
      editorUserId: 'subject-admin',
      editorDisplayName: 'admin@example.test',
    });
  });

  it('falls back to subject when req.user.email is null', async () => {
    const persisted = buildPersistedRecord();
    const { repo, upsertSingleton } = makeRepoStub();
    upsertSingleton.mockResolvedValue(persisted);

    const controller = new CompanyInfoController(repo);
    const req = buildRequest({ subject: 'subject-only', email: null, roles: ['admin'] });

    await controller.upsertCompanyInfo({ legalName: 'X' }, req);

    expect(upsertSingleton).toHaveBeenCalledWith(
      { legalName: 'X' },
      { editorUserId: 'subject-only', editorDisplayName: 'subject-only' },
    );
  });

  it('throws UnauthorizedException when req.user is undefined', async () => {
    const { repo } = makeRepoStub();
    const controller = new CompanyInfoController(repo);
    const req = buildRequest(undefined);

    await expect(controller.upsertCompanyInfo({ legalName: 'X' }, req)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('propagates repository errors', async () => {
    const { repo, upsertSingleton } = makeRepoStub();
    upsertSingleton.mockRejectedValue(new Error('write conflict'));

    const controller = new CompanyInfoController(repo);
    const req = buildRequest({ subject: 's', email: 'e@example.test', roles: [] });

    await expect(controller.upsertCompanyInfo({ legalName: 'X' }, req)).rejects.toThrow(
      'write conflict',
    );
  });
});

describe('CompanyInfoController.listVersions', () => {
  it('calls the repository with take = 50 (default) when query is empty', async () => {
    const { repo, listVersions } = makeRepoStub();
    listVersions.mockResolvedValue({ items: [], nextCursor: null });

    const controller = new CompanyInfoController(repo);

    await controller.listVersions({});

    expect(listVersions).toHaveBeenCalledWith({ take: 50, cursor: undefined });
  });

  it('passes through validated take + cursor', async () => {
    const { repo, listVersions } = makeRepoStub();
    listVersions.mockResolvedValue({ items: [], nextCursor: null });

    const controller = new CompanyInfoController(repo);

    await controller.listVersions({ take: 25, cursor: 'abc' });

    expect(listVersions).toHaveBeenCalledWith({ take: 25, cursor: 'abc' });
  });

  it('returns the repository result unchanged', async () => {
    const { repo, listVersions } = makeRepoStub();
    const page = { items: [buildVersion()], nextCursor: 'v-1' };
    listVersions.mockResolvedValue(page);

    const controller = new CompanyInfoController(repo);
    await expect(controller.listVersions({})).resolves.toBe(page);
  });
});

describe('CompanyInfoController.findVersionById', () => {
  it('returns the version unchanged on hit', async () => {
    const { repo, findVersionById } = makeRepoStub();
    const version = buildVersion({ id: 'v-known' });
    findVersionById.mockResolvedValue(version);

    const controller = new CompanyInfoController(repo);

    await expect(controller.findVersionById('v-known')).resolves.toBe(version);
    expect(findVersionById).toHaveBeenCalledWith('v-known');
  });

  it('throws NotFoundException("Version not found") on miss', async () => {
    const { repo, findVersionById } = makeRepoStub();
    findVersionById.mockResolvedValue(null);

    const controller = new CompanyInfoController(repo);

    await expect(controller.findVersionById('missing')).rejects.toBeInstanceOf(NotFoundException);
    await expect(controller.findVersionById('missing')).rejects.toThrow('Version not found');
  });
});

describe('CompanyInfoController source-level guard declarations', () => {
  const controllerSource = readFileSync(
    join(__dirname, '..', 'company-info.controller.ts'),
    'utf8',
  );

  it('declares the JwtAuthGuard, admin role, and bearer security scheme', () => {
    expect(controllerSource).toContain('@UseGuards(JwtAuthGuard)');
    expect(controllerSource).toContain('@AuthRoles(AUTH_ROLE_ADMIN)');
    expect(controllerSource).toContain("@ApiBearerAuth('accessToken')");
  });

  it('declares 200/400/401/403 statuses on the mutation surfaces and 404 on by-id', () => {
    expect(controllerSource).toContain('status: 200');
    expect(controllerSource).toContain('status: 400');
    expect(controllerSource).toContain('status: 401');
    expect(controllerSource).toContain('status: 403');
    expect(controllerSource).toContain('status: 404');
  });

  it('declares @ResourceCaptures with fromPath:id and resource:companyInfo on PUT', () => {
    expect(controllerSource).toMatch(/@ResourceCaptures\(\s*\{\s*fromPath:\s*'id'/);
    expect(controllerSource).toContain("resource: 'companyInfo'");
    expect(controllerSource).toContain("pathParam: 'id'");
  });

  it('registers static versions route BEFORE versions/:id (path-matcher ordering)', () => {
    const versionsIdx = controllerSource.indexOf("@Get('versions')");
    const versionsByIdIdx = controllerSource.indexOf("@Get('versions/:id')");
    expect(versionsIdx).toBeGreaterThan(-1);
    expect(versionsByIdIdx).toBeGreaterThan(-1);
    expect(versionsIdx).toBeLessThan(versionsByIdIdx);
  });
});
