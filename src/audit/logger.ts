import { prisma } from '../config/database.js';

export interface AuditLogEntry {
  userId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  success: boolean;
  details?: Record<string, unknown>;
}

export class AuditLogger {
  async log(entry: AuditLogEntry): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          userId: entry.userId,
          action: entry.action,
          resourceType: entry.resourceType,
          resourceId: entry.resourceId,
          ipAddress: entry.ipAddress,
          userAgent: entry.userAgent,
          success: entry.success,
          details: entry.details ? JSON.stringify(entry.details) : null,
        },
      });
    } catch (err) {
      console.error('[AUDIT FATAL] Failed to write audit log to DB:', err);
    }
  }
}

export const auditLogger = new AuditLogger();
