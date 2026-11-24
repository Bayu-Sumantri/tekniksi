import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const account = await prisma.user.findFirst({
    where: { username: { equals: 'bayu', mode: 'insensitive' } },
    select: { id: true, username: true, role: true },
  });

  if (!account) {
    throw new Error('Akun username bayu tidak ditemukan. Tidak ada perubahan database.');
  }

  if (account.role === 'super_admin') {
    console.log('Akun bayu sudah memiliki role super_admin.');
    return;
  }

  await prisma.user.update({ where: { id: account.id }, data: { role: 'super_admin' } });
  console.log(`Role akun ${account.username} berhasil diubah menjadi super_admin.`);
  console.log('Password dan data histori tidak diubah.');
}

main()
  .catch((error) => {
    console.error('Gagal mengubah role:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
