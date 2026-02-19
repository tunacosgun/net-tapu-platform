import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { RequestContext } from './request-context';

@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const requestId =
      (req.headers['x-request-id'] as string) || randomUUID();
    res.setHeader('X-Request-ID', requestId);

    RequestContext.run({ requestId }, () => next());
  }
}
