import { LoggerService } from '@nestjs/common';
import { RequestContext } from './request-context';

export class JsonLoggerService implements LoggerService {
  constructor(private readonly serviceName: string) {}

  log(message: string, context?: string): void {
    this.emit('info', message, context);
  }

  error(message: string, trace?: string, context?: string): void {
    this.emit('error', message, context, trace);
  }

  warn(message: string, context?: string): void {
    this.emit('warn', message, context);
  }

  debug(message: string, context?: string): void {
    this.emit('debug', message, context);
  }

  verbose(message: string, context?: string): void {
    this.emit('verbose', message, context);
  }

  fatal(message: string, context?: string): void {
    this.emit('fatal', message, context);
  }

  private emit(
    level: string,
    message: string,
    context?: string,
    trace?: string,
  ): void {
    const ctx = RequestContext.get();
    const entry: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level,
      service: this.serviceName,
      context: context ?? undefined,
      event: message,
    };

    if (ctx?.requestId) entry.requestId = ctx.requestId;
    if (ctx?.userId) entry.userId = ctx.userId;
    if (ctx?.auctionId) entry.auctionId = ctx.auctionId;
    if (trace) entry.trace = trace;

    process.stdout.write(JSON.stringify(entry) + '\n');
  }
}
