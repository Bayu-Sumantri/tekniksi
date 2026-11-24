
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const result = await db.$transaction(async (tx) => {
    const histories = await tx.history.deleteMany({
      where: { id: { startsWith: "DEMO_HISTORY_" } },
    });

    const items = await tx.item.deleteMany({
      where: { id: { startsWith: "DEMO_ITEM_" } },
    });

    const users = await tx.user.deleteMany({
      where: { id: { startsWith: "DEMO_USER_" } },
    });

    return {
      histories: histories.count,
      items: items.count,
      users: users.count,
    };
  });

  console.log("DATA DEMO BERHASIL DIBERSIHKAN");
  console.log(`Riwayat dihapus : ${result.histories}`);
  console.log(`Barang dihapus  : ${result.items}`);
  console.log(`Akun dihapus    : ${result.users}`);
  console.log("Data asli tetap dipertahankan.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
