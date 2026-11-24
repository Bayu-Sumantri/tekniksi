# Catatan reset dan keamanan Tekniksi

## Reset data (pertahankan semua pengguna)

1. Pastikan `.env`/`.env.local` menunjuk database yang benar.
2. Backup terlebih dahulu:
   `pg_dump -Fc -d "$DATABASE_URL" -f tekniksi-before-reset.dump`
3. Jalankan dengan konfirmasi eksplisit:
   `CONFIRM_CLEAR_INVENTORY=YES npm run db:clear-inventory-keep-users`

Script menghapus seluruh record pada `History`, `Item`, dan `BulkApprovalCode`. Script tidak menjalankan operasi DELETE/UPDATE pada `User`.

## Setelah memasang source

```bash
npm install
npx prisma generate
npx prisma migrate deploy
npm run dev
```

Jangan menjalankan seed demo jika ingin database tetap kosong. Reset database tidak dilakukan otomatis ketika aplikasi dibuka.

## Keamanan

- Isi `SESSION_SECRET` dengan output `openssl rand -base64 48` (jangan bagikan atau commit secret).
- Pakai HTTPS di production, password akun yang unik dan kuat, serta batasi akses PostgreSQL hanya dari host aplikasi.
- Throttling login yang ditambahkan bersifat per proses; gunakan rate limiting reverse proxy/WAF atau Redis untuk deployment multi-instance.
- Perubahan ini meningkatkan baseline keamanan, tetapi tidak bisa menjamin web kebal dari semua serangan. Audit dependency, backup rutin, monitoring, dan penetration test tetap diperlukan.
