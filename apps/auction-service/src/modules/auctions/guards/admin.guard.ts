import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const role: string | undefined =
      req.user?.role ?? req.headers?.['x-user-role'];

    if (role !== 'admin' && role !== 'superadmin') {
      throw new ForbiddenException('Admin access required');
    }

    return true;
  }
}
