import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('AppModule source', () => {
  const source = readFileSync(join(__dirname, '..', 'app.module.ts'), 'utf8');

  it('declares the AppModule class with the @Module decorator', () => {
    expect(source).toContain('@Module({');
    expect(source).toContain('export class AppModule');
  });

  it('imports and registers AuthModule, HealthModule, and CompanyInfoModule', () => {
    expect(source).toContain("import { AuthModule } from './modules/auth/auth.module'");
    expect(source).toContain(
      "import { CompanyInfoModule } from './modules/company-info/company-info.module'",
    );
    expect(source).toContain("import { HealthModule } from './modules/health/health.module'");
    expect(source).toContain('AuthModule,');
    expect(source).toContain('HealthModule,');
    expect(source).toContain('CompanyInfoModule,');
  });

  it('configures ThrottlerModule with the default 100/min limit', () => {
    expect(source).toContain('ThrottlerModule.forRoot');
    expect(source).toContain('ttl: 60000');
    expect(source).toContain('limit: 100');
  });

  it('imports AppConfigModule for environment validation', () => {
    expect(source).toContain("import { AppConfigModule } from './config/config.module'");
    expect(source).toContain('AppConfigModule,');
  });
});
