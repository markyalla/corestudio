import { prisma } from "./prisma";
import type { Prisma } from "@prisma/client";

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Write an audit log entry. Pass the transaction client when inside a
 * transaction so the log commits atomically with the mutation.
 */
export async function audit(
  db: Db,
  entry: {
    userId?: string | null;
    action: string;
    entity: string;
    entityId: string;
    payload?: Prisma.InputJsonValue;
  },
) {
  await db.auditLog.create({
    data: {
      userId: entry.userId ?? null,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      payload: entry.payload,
    },
  });
}
