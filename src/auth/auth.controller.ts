import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AuthService } from './auth.service.js';
import { AuthDto } from './dto/auth.dto.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

interface AuthenticatedRequest extends FastifyRequest {
  user: { sub: number; username: string };
}

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  signup(@Body() dto: AuthDto) {
    return this.authService.signup(dto);
  }

  @Post('signin')
  @HttpCode(HttpStatus.OK)
  async signin(
    @Body() dto: AuthDto,
    @Res({ passthrough: true }) response: FastifyReply,
  ) {
    const result = await this.authService.signin(dto);

    response.setCookie('token', result.access_token, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      path: '/',
      maxAge: 7 * 24 * 60 * 60, // 7 days (matching token expiry)
    });

    return result;
  }

  @Post('signout')
  @HttpCode(HttpStatus.OK)
  signout(@Res({ passthrough: true }) response: FastifyReply) {
    response.clearCookie('token', {
      path: '/',
      sameSite: 'none',
      httpOnly: true,
      secure: true,
    });
    return { message: 'Logged out successfully' };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMe(@Req() req: AuthenticatedRequest) {
    return this.authService.getMe(req.user.sub);
  }
}
