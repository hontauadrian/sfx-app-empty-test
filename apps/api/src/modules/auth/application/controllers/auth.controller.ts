import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiEnvelopeDto } from '../../../../common/dto/envelope.dto';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { AuthSessionDto } from '../dto/auth-session.dto';
import type { AuthenticatedRequest } from '../types/authenticated-request';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Current authenticated user session' })
  @ApiResponse({
    status: 200,
    description: 'Authenticated user session',
    type: ApiEnvelopeDto(AuthSessionDto),
  })
  me(@Req() request: AuthenticatedRequest): AuthSessionDto {
    return {
      isAuthenticated: true,
      subject: request.user.subject,
      email: request.user.email,
      roles: request.user.roles,
    };
  }
}
