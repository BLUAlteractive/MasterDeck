import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthService } from '../auth/service';
import { ApiFailure } from '../auth/errors';
import {
  MatchSettlementService,
  type ClassicAdmissionPolicy,
} from './settlement';
@Controller('v1')
export class ChipController {
  constructor(
    @Inject('AUTH_SERVICE') private readonly auth: AuthService | null,
    @Inject('ADMISSION_POLICY')
    private readonly policy: ClassicAdmissionPolicy | null,
  ) {}
  private service() {
    if (!this.auth) throw new ApiFailure('AUTH_NOT_CONFIGURED', 503);
    return {
      auth: this.auth,
      matches: new MatchSettlementService(this.auth.database, this.policy),
    };
  }
  @Get('play-chips') async balance(@Req() req: Request) {
    const { auth, matches } = this.service();
    return matches.balance(await auth.authenticate(req.headers.authorization));
  }
  @Post('games/start') @HttpCode(200) async start(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    const { auth, matches } = this.service();
    return matches.start(
      await auth.authenticate(req.headers.authorization),
      body,
    );
  }
  @Post('games/finish') @HttpCode(200) async finish(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    const { auth, matches } = this.service();
    return matches.finish(
      await auth.authenticate(req.headers.authorization),
      body,
    );
  }
}
