import { Module } from '@nestjs/common';
import { AuthTokenService } from '../../common/auth/auth-token.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthController } from './application/controllers/auth.controller';

@Module({
  controllers: [AuthController],
  providers: [AuthTokenService, JwtAuthGuard],
  exports: [AuthTokenService, JwtAuthGuard],
})
export class AuthModule {}
