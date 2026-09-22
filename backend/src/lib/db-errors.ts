import { Prisma } from "@prisma/client";
import { ApiError } from "./errors";

/** Wraps a delete so a still-referenced-elsewhere FK violation becomes a
 *  friendly 409 instead of apiHandler's generic 500. */
export async function deleteOrConflict<T>(fn: () => Promise<T>, message: string): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && (err.code === "P2003" || err.code === "P2014")) {
      throw new ApiError(409, message);
    }
    throw err;
  }
}
