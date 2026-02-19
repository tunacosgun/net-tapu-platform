import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContextData {
  requestId: string;
  userId?: string;
  auctionId?: string;
}

const storage = new AsyncLocalStorage<RequestContextData>();

export class RequestContext {
  static run<T>(ctx: RequestContextData, fn: () => T): T {
    return storage.run(ctx, fn);
  }

  static get(): RequestContextData | undefined {
    return storage.getStore();
  }

  static set(partial: Partial<RequestContextData>): void {
    const current = storage.getStore();
    if (current) {
      Object.assign(current, partial);
    }
  }
}
