import { prisma } from "./prisma";
import { newId } from "./auth";
import type { Prisma } from "@prisma/client";
export async function history(
  tx: Prisma.TransactionClient,
  data: {
    type: string;
    itemId: string;
    itemName: string;
    quantity: number;
    before: number;
    after: number;
    purpose?: string;
    note?: string;
    relatedId?: string;
    createdBy: string;
    userId: string;
    imagePath?: string;
  },
) {
  await tx.history.create({
    data: {
      id: newId("HIS"),
      ...data,
      purpose: data.purpose ?? "",
      note: data.note ?? "",
      relatedId: data.relatedId ?? "",
      imagePath: data.imagePath ?? "",
    },
  });
}
export const safeError = (e: unknown) =>
  e instanceof Error ? e.message : "Terjadi kesalahan server.";
