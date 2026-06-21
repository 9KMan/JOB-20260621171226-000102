/**
 * HIPAA Audit Middleware
 * Logs all PHI access and modifications to the AuditLog table.
 * Wrapped in try/catch — audit failures must never break the request.
 */

import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export type AuditAction =
  | 'VIEW'
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'LOGIN'
  | 'LOGOUT'
  | 'REGISTER'
  | 'MFA_VERIFY';

export type ResourceType =
  | 'Patient'
  | 'Appointment'
  | 'Message'
  | 'MessageThread'
  | 'User'
  | 'Provider';

/**
 * Audit middleware factory.
 * Usage: router.post('/patients', auditLog('CREATE', 'Patient'), handler)
 *
 * Captures: userId (from JWT), IP address, user agent, resource ID
 */
export function auditLog(action: AuditAction, resourceType: ResourceType) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Skip audit for OPTIONS requests (CORS preflight)
    if (req.method === 'OPTIONS') {
      next();
      return;
    }

    try {
      const userId = req.user?.sub ?? 'anonymous';
      const ipAddress = (req.ip as string) || req.socket.remoteAddress || 'unknown';
      const userAgent = req.headers['user-agent'] || 'unknown';

      // Extract resource ID from params or body
      let resourceId: string | undefined;

      // Check params first (e.g., /patients/:id)
      if (req.params.id) {
        resourceId = req.params.id;
      } else if (req.params.threadId) {
        resourceId = req.params.threadId;
      }

      // Check body as fallback (e.g., POST with { patientId: "..." })
      if (!resourceId && req.body) {
        resourceId =
          req.body.id ||
          req.body.patientId ||
          req.body.appointmentId ||
          req.body.userId ||
          req.body.messageId;
      }

      // Write to audit log — fire and forget (don't await blocking)
      prisma.auditLog
        .create({
          data: {
            userId,
            action,
            resource: resourceType,
            resourceId,
            ipAddress,
          },
        })
        .catch((err) => {
          // Log error but don't throw — audit failure must never break the request
          console.error('[AUDIT FAILURE]', {
            action,
            resourceType,
            resourceId,
            userId,
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        });

      next();
    } catch (err) {
      // Defensive: if anything goes wrong in the middleware itself, continue the request
      console.error('[AUDIT MIDDLEWARE ERROR]', err);
      next();
    }
  };
}
