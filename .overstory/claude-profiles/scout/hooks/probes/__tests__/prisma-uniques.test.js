'use strict';

// Unit tests for detectors/prisma-uniques.js.
// Run directly: `node __tests__/prisma-uniques.test.js`

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  detectPrismaUniques,
  stripComments,
  extractModelBlocks,
  parseModelBody,
} = require('../detectors/prisma-uniques');

function mkTmpProject(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prisma-uniques-test-'));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  return root;
}

test('stripComments removes // and /* */ comments', () => {
  const src = `
    model User {  // inline
      id String @id  // @unique
      /* block
         @unique here should vanish */
      email String @unique
    }
  `;
  const out = stripComments(src);
  assert.ok(out.includes('email String @unique'));
  assert.ok(!out.includes('@unique here'));
  assert.ok(!out.includes('// @unique'));
});

test('extractModelBlocks finds every model body', () => {
  const src = `
    model User { id String @id }
    model Post { id String @id authorId String }
    enum Role { ADMIN MEMBER }
  `;
  const blocks = extractModelBlocks(src);
  assert.deepStrictEqual(Object.keys(blocks).sort(), ['Post', 'User']);
  assert.ok(blocks.User.includes('id String @id'));
  assert.ok(blocks.Post.includes('authorId String'));
});

test('parseModelBody pulls id, unique, and field types', () => {
  const body = `
    id           String    @id @default(cuid())
    email        String    @unique
    name         String
    passwordHash String    @map("password_hash")
    role         String    @default("MEMBER")
    avatarUrl    String?   @map("avatar_url")
    createdAt    DateTime  @default(now()) @map("created_at")
  `;
  const parsed = parseModelBody(body);
  assert.strictEqual(parsed.idField, 'id');
  assert.deepStrictEqual(parsed.uniqueFields, ['email']);
  assert.deepStrictEqual(parsed.compositeUniques, []);
  assert.strictEqual(parsed.fieldTypes.email, 'String');
  assert.strictEqual(parsed.fieldTypes.avatarUrl, 'String');
  assert.strictEqual(parsed.fieldTypes.createdAt, 'DateTime');
});

test('parseModelBody captures composite @@unique', () => {
  const body = `
    id     String @id
    orgId  String
    slug   String
    @@unique([orgId, slug])
    @@index([orgId])
  `;
  const parsed = parseModelBody(body);
  assert.deepStrictEqual(parsed.compositeUniques, [['orgId', 'slug']]);
});

test('parseModelBody handles optional + array types', () => {
  const body = `
    id        String   @id
    tags      String[]
    bio       String?
  `;
  const parsed = parseModelBody(body);
  assert.strictEqual(parsed.fieldTypes.tags, 'String');
  assert.strictEqual(parsed.fieldTypes.bio, 'String');
});

test('detectPrismaUniques end-to-end for User @unique email', () => {
  const root = mkTmpProject({
    'packages/database/prisma/schema.prisma': `
      model User {
        id    String @id @default(cuid())
        email String @unique
        name  String
      }
    `,
  });
  const result = detectPrismaUniques(root, null);
  assert.strictEqual(result.source, 'packages/database/prisma/schema.prisma');
  assert.deepStrictEqual(result.models.User.uniqueFields, ['email']);
  assert.strictEqual(result.models.User.idField, 'id');
});

test('detectPrismaUniques returns empty when no schema present', () => {
  const root = mkTmpProject({ 'README.md': '# nothing' });
  const result = detectPrismaUniques(root, null);
  assert.deepStrictEqual(result, { models: {}, source: null });
});

test('detectPrismaUniques ignores commented-out @unique', () => {
  const root = mkTmpProject({
    'packages/database/prisma/schema.prisma': `
      model User {
        id    String @id
        email String  // was @unique, not any more
        name  String
      }
    `,
  });
  const result = detectPrismaUniques(root, null);
  assert.deepStrictEqual(result.models.User.uniqueFields, []);
});

test('detectPrismaUniques finds schema in alternate locations', () => {
  const root = mkTmpProject({
    'prisma/schema.prisma': `
      model Foo {
        id   String @id
        slug String @unique
      }
    `,
  });
  const result = detectPrismaUniques(root, null);
  assert.strictEqual(result.source, 'prisma/schema.prisma');
  assert.deepStrictEqual(result.models.Foo.uniqueFields, ['slug']);
});

test('detectPrismaUniques captures multiple models with mix of uniques', () => {
  const root = mkTmpProject({
    'packages/database/prisma/schema.prisma': `
      model User {
        id    String @id
        email String @unique
      }
      model Org {
        id   String @id
        slug String @unique
        name String
      }
      model Membership {
        id     String @id
        userId String
        orgId  String
        @@unique([userId, orgId])
      }
    `,
  });
  const result = detectPrismaUniques(root, null);
  assert.deepStrictEqual(Object.keys(result.models).sort(), ['Membership', 'Org', 'User']);
  assert.deepStrictEqual(result.models.User.uniqueFields, ['email']);
  assert.deepStrictEqual(result.models.Org.uniqueFields, ['slug']);
  assert.deepStrictEqual(result.models.Membership.compositeUniques, [['userId', 'orgId']]);
});
