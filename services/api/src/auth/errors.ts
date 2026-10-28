import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Response } from 'express';

export class ApiFailure extends HttpException {
  constructor(
    readonly code: string,
    status: number,
  ) {
    super({ code }, status);
  }
}
@Catch()
export class SafeErrorFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const status = error instanceof HttpException ? error.getStatus() : 503;
    const code =
      error instanceof ApiFailure
        ? error.code
        : ((
            {
              400: 'INVALID_REQUEST',
              401: 'UNAUTHORIZED',
              403: 'FORBIDDEN',
              404: 'NOT_FOUND',
              413: 'REQUEST_TOO_LARGE',
              429: 'RATE_LIMITED',
            } as Record<number, string>
          )[status] ?? 'SERVICE_UNAVAILABLE');
    const requestId = randomUUID();
    console.warn(
      JSON.stringify({
        event: 'api.request_rejected',
        code,
        status,
        requestId,
      }),
    );
    response.status(status).json({
      error: {
        code,
        message: code.replaceAll('_', ' ').toLowerCase(),
        requestId,
      },
    });
  }
}
