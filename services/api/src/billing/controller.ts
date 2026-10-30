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
import { BillingService } from './service';
@Controller('v1/billing')
export class BillingController {
  constructor(
    @Inject('AUTH_SERVICE') readonly auth: AuthService | null,
    @Inject('BILLING_SERVICE') readonly service: BillingService | null,
  ) {}
  private enabled() {
    if (!this.service) throw new ApiFailure('BILLING_NOT_CONFIGURED', 503);
    return this.service;
  }
  private async principal(req: Request) {
    if (!this.auth) throw new ApiFailure('AUTH_NOT_CONFIGURED', 503);
    return this.auth.authenticate(req.headers.authorization);
  }
  @Get('context') async context(@Req() req: Request) {
    return this.enabled().context(await this.principal(req));
  }
  @Post('verify') @HttpCode(200) async verify(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    const result = await this.enabled().verify(await this.principal(req), body);
    console.info(JSON.stringify({ event: 'billing.verify', status: 'ok' }));
    return result;
  }
  @Post('restore') @HttpCode(200) async restore(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    const p = await this.principal(req),
      service = this.enabled();
    const receipt = await service.verify(p, body);
    return service.currentPurchase(p, receipt.purchaseId);
  }
  @Post('notifications/apple') @HttpCode(202) async apple(
    @Body() body: unknown,
  ) {
    return this.enabled().notification('APPLE', body);
  }
  @Post('notifications/google') @HttpCode(202) async google(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    return this.enabled().notification(
      'GOOGLE',
      body,
      req.headers.authorization,
    );
  }
}
