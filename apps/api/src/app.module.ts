import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppConfigModule } from './config/config.module';
import { AuthModule } from './modules/auth/auth.module';
import { BrandProfileModule } from './modules/brand-profile/brand-profile.module';
import { BrandVoiceModule } from './modules/brand-voice/brand-voice.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    AppConfigModule,
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),
    AuthModule,
    BrandProfileModule,
    BrandVoiceModule,
    HealthModule,
  ],
})
export class AppModule {}
