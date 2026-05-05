import { readFileSync, readdirSync, type Dirent } from 'node:fs';
import { join } from 'node:path';
import type { NextConfig } from 'next';

// Auto-discover every @sfx/* workspace package under ../../packages so that
// Next.js transpiles their raw TS/TSX on the fly. Adding a new package
// requires zero edits here — drop a folder with a package.json whose "name"
// starts with "@sfx/" and the next dev restart picks it up.
function discoverSharedPackages(): string[] {
  const packagesDir = join(__dirname, '../../packages');
  let entries: Dirent<string>[];
  try {
    entries = readdirSync(packagesDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const names: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      const pkg = JSON.parse(
        readFileSync(join(packagesDir, entry.name, 'package.json'), 'utf8'),
      ) as { name?: unknown };
      if (typeof pkg.name === 'string' && pkg.name.startsWith('@sfx/')) {
        names.push(pkg.name);
      }
    } catch {
      // Missing/invalid package.json — skip silently.
    }
  }
  return names;
}

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  transpilePackages: discoverSharedPackages(),
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
