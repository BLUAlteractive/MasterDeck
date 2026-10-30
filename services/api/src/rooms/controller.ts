import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { AuthService } from '../auth/service';
import { ApiFailure } from '../auth/errors';
import type { RoomProtocol } from './router';
import { RoomVersionConflict } from './shared';
@Controller('v1/games')
export class PokerRoomController {
  constructor(
    @Inject('AUTH_SERVICE') private readonly auth: AuthService | null,
    @Inject('POKER_ROOMS') private readonly rooms: RoomProtocol | null,
  ) {}
  @Get(':gameId')
  async read(@Req() req: Request, @Param('gameId') gameId: string) {
    if (!this.auth || !this.rooms)
      throw new ApiFailure('AUTH_NOT_CONFIGURED', 503);
    return this.rooms.read(
      await this.auth.authenticate(req.headers.authorization),
      gameId,
    );
  }
  @Post('resume')
  @HttpCode(200)
  async resume(@Req() req: Request, @Body() body: unknown) {
    if (!this.auth || !this.rooms)
      throw new ApiFailure('AUTH_NOT_CONFIGURED', 503);
    return this.rooms.resume(
      await this.auth.authenticate(req.headers.authorization),
      body,
    );
  }
  @Post('commands')
  @HttpCode(200)
  async command(
    @Req() req: Request,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (!this.auth || !this.rooms)
      throw new ApiFailure('AUTH_NOT_CONFIGURED', 503);
    try {
      return await this.rooms.command(
        await this.auth.authenticate(req.headers.authorization),
        body,
      );
    } catch (error) {
      if (error instanceof RoomVersionConflict) {
        response.status(409);
        return {
          error: {
            code: error.code,
            message: 'stale version',
            requestId: randomUUID(),
          },
          resync: error.resync,
        };
      }
      throw error;
    }
  }
}
