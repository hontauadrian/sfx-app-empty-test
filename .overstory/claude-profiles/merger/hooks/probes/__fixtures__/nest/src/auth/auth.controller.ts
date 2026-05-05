import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';

class RegisterDto {}
class JwtAuthGuard {}
const Public = () => () => {};

@Controller('auth')
export class AuthController {
  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return { ok: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me() {
    return { id: 1 };
  }
}
