import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger('AuditLog');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, body } = request;
    const user = request.user;
    const userId = user?.id || 'anonymous';
    const timestamp = new Date().toISOString();

    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      this.logger.log(
        `[${timestamp}] ${method} ${url} by user:${userId} body:${JSON.stringify(body)}`,
      );
    }

    return next.handle().pipe(
      tap(() => {
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
          this.logger.log(`[${timestamp}] ${method} ${url} completed by user:${userId}`);
        }
      }),
    );
  }
}
