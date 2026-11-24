import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  if (process.env.CONFIRM_CLEAR_INVENTORY !== "YES") {
    throw new Error("Dibatalkan. Set CONFIRM_CLEAR_INVENTORY=YES untuk menghapus seluruh Item, History, dan BulkApprovalCode. User tidak disentuh.");
  }

  const beforeUsers = await db.user.count();
  const result = await db.$transaction(async (tx) => {
    // Hapus tabel anak lebih dahulu; seluruh akun pengguna tetap dipertahankan.
    const histories = await tx.history.deleteMany({});
    const items = await tx.item.deleteMany({});
    const approvalCodes = await tx.bulkApprovalCode.deleteMany({});
    return { histories: histories.count, items: items.count, approvalCodes: approvalCodes.count };
  });
  const afterUsers = await db.user.count();
  if (beforeUsers !== afterUsers) throw new Error("Pemeriksaan gagal: jumlah pengguna berubah.");

  console.log("RESET DATA INVENTARIS SELESAI");
  console.log(`History dihapus: ${result.histories}`);
  console.log(`Item dihapus: ${result.items}`);
  console.log(`Kode persetujuan dihapus: ${result.approvalCodes}`);
  console.log(`User dipertahankan: ${afterUsers}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(async () => { await db.$disconnect(); });
