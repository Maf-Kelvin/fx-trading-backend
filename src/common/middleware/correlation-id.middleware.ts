import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

export const CORRELATION_ID_HEADER = 'X-Request-ID';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction) {
    const correlationId =
      (req.headers[CORRELATION_ID_HEADER.toLowerCase()] as string) || uuidv4();

    req['correlationId'] = correlationId;
    res.setHeader(CORRELATION_ID_HEADER, correlationId);

    const { method, originalUrl } = req;
    const start = Date.now();

    res.on('finish', () => {
      const ms = Date.now() - start;
      this.logger.log(
        `[${correlationId}] ${method} ${originalUrl} ${res.statusCode} +${ms}ms`,
      );
    });

    next();
  }
}