import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export interface AuditLogParams {
  adminUserId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  oldValues?: unknown;
  newValues?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Log an admin action to the audit_logs table.
 *
 * This is fire-and-forget: errors are logged to stderr but never thrown,
 * so audit logging can never break a request.
 */
export async function logAudit(params: AuditLogParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        adminUserId: params.adminUserId ?? null,
        action: params.action,
        resourceType: params.resourceType,
        resourceId: params.resourceId ?? null,
        oldValues: params.oldValues ? JSON.parse(JSON.stringify(params.oldValues)) : undefined,
        newValues: params.newValues ? JSON.parse(JSON.stringify(params.newValues)) : undefined,
        ipAddress: params.ipAddress ?? null,
        userAgent: params.userAgent ?? null,
      },
    });
  } catch (err) {
    console.error("[AUDIT] Failed to write audit log:", err);
  }
}

/**
 * Log a license event to the license_events table.
 */
export async function logLicenseEvent(params: {
  licenseId?: string | null;
  activationId?: string | null;
  organizationId?: string | null;
  action: string;
  actorType: "admin" | "system" | "desktop_app";
  actorId?: string | null;
  actorEmail?: string | null;
  actorIp?: string | null;
  oldValues?: unknown;
  newValues?: unknown;
  metadata?: unknown;
}): Promise<void> {
  try {
    await prisma.licenseEvent.create({
      data: {
        licenseId: params.licenseId ?? null,
        activationId: params.activationId ?? null,
        organizationId: params.organizationId ?? null,
        action: params.action,
        actorType: params.actorType,
        actorId: params.actorId ?? null,
        actorEmail: params.actorEmail ?? null,
        actorIp: params.actorIp ?? null,
        oldValues: params.oldValues ? JSON.parse(JSON.stringify(params.oldValues)) : undefined,
        newValues: params.newValues ? JSON.parse(JSON.stringify(params.newValues)) : undefined,
        metadata: params.metadata ? JSON.parse(JSON.stringify(params.metadata)) : undefined,
      },
    });
  } catch (err) {
    console.error("[AUDIT] Failed to write license event:", err);
  }
}
