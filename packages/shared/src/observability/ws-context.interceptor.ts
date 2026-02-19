import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { randomUUID } from 'crypto';
import { RequestContext } from './request-context';

@Injectable()
export class WsContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const client = context.switchToWs().getClient();
    const data = context.switchToWs().getData();

    const requestId =
      (client.data?.requestId as string) || randomUUID();
    const userId = client.data?.userId as string | undefined;
    const auctionId = (data?.auctionId as string) || undefined;

    return new Observable((subscriber) => {
      RequestContext.run({ requestId, userId, auctionId }, () => {
        next.handle().subscribe(subscriber);
      });
    });
  }
}
