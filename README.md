# Tekniksi — Next.js + TypeScript + PostgreSQL

Migrasi aplikasi inventaris teknisi dari Express + HTML/JavaScript + ExcelJS ke Next.js App Router, TypeScript, Prisma ORM, dan PostgreSQL.

## Fitur yang dibawa

- Login dan hak akses Admin/User; password tetap memakai bcrypt.
- Dashboard: jumlah jenis barang, total stok, peringatan stok ≤ 5, dan aktivitas terakhir.
- Master inventaris: tambah, ubah stok/nama/kategori, hapus barang. Riwayat transaksi tetap menyimpan nama barang meski master barang dihapus.
- Barang masuk (admin), barang keluar (admin/user), dan barang tarikan (admin/user).
- Validasi stok tidak minus; barang tarikan dibatasi jumlah barang keluar yang belum ditarik.
- Histori transaksi, manajemen akun, ganti password, backup JSON, ekspor Excel dan PDF.
- UI baru responsif dengan navigasi sidebar, ringkasan kartu, tabel, dan formulir.

## Persyaratan

- Node.js 20.9 atau lebih baru
- PostgreSQL 14 atau lebih baru
- npm

## Instalasi lokal

1. Ekstrak project, lalu buka terminal pada folder `tekniksi-main`.
2. Jalankan `npm install`.
3. Salin `.env.example` menjadi `.env`, lalu isi koneksi PostgreSQL dan secret:

   ```env
   DATABASE_URL="postgresql://postgres:password@localhost:5432/tekniksi?schema=public"
   SESSION_SECRET="buat-random-secret-panjang-minimal-32-karakter"
   APP_URL="http://localhost:3000"
   ```

4. Buat database kosong bernama `tekniksi` di PostgreSQL.
5. Jalankan:

   ```bash
   npx prisma generate
   npx prisma migrate dev --name init
   npm run db:seed
   npm run dev
   ```

6. Buka `http://localhost:3000`.

Akun awal hanya dibuat jika tabel pengguna masih kosong: username `admin`, password default `admin` (atau isi `INITIAL_ADMIN_PASSWORD` sebelum seed). Ganti segera setelah login.

## Migrasi data Excel lama

> File ZIP kode sumber tidak menyertakan `data/inventaris.xlsx` maupun foto pengguna. Ambil keduanya dari instalasi lama sebelum memulai impor. Jangan menghapus atau menimpa folder data lama.

1. Hentikan server aplikasi lama dan buat salinan cadangan folder `data/` secara utuh.
2. Salin workbook lama ke lokasi yang dapat dibaca, misalnya `legacy/inventaris.xlsx`.
3. Pastikan sheet bernama `Users`, `Items`, dan `Riwayat` (skrip juga menerima `History`). Header kolom harus sama dengan versi lama.
4. Jalankan migrasi schema terlebih dahulu, lalu:

   ```bash
   npm run db:import-excel -- ./legacy/inventaris.xlsx
   ```

5. Skrip melakukan upsert berdasarkan ID, mempertahankan ID lama dan hash bcrypt. Jalankan impor satu kali setelah backup. Impor ulang akan memperbarui pengguna/barang dengan ID sama dan menghindari duplikasi riwayat.
6. Salin folder foto lama `data/foto/` ke `public/foto/` (pertahankan subfolder dan nama file). Path foto relatif di database lama tetap disimpan; verifikasi URL foto di UI dan sesuaikan prefix path bila struktur lama berbeda.
7. Bandingkan jumlah pengguna, barang, dan riwayat antara workbook lama dan database baru sebelum menjadikan PostgreSQL sebagai sumber data utama.

### Skema data PostgreSQL

- `User`: `id`, `username`, `passwordHash`, `role`, `createdAt`.
- `Item`: `id`, `name`, `category`, `stock`, `imagePath`, `createdAt`, `updatedAt`.
- `History`: `id`, `createdAt`, `type`, `itemId` (nullable), `itemName`, `quantity`, `before`, `after`, `purpose`, `note`, `relatedId`, `createdBy`, `imagePath`.

`History.itemId` nullable dengan `onDelete: SetNull`, sehingga riwayat tetap ada saat master barang dihapus.

## Operasional

- Pengembangan: `npm run dev`
- Build produksi: `npm run build`
- Jalankan build: `npm start`
- Perubahan schema: ubah `prisma/schema.prisma`, lalu `npx prisma migrate dev --name nama-perubahan`.
- Backup data: login sebagai Admin, buka Pengaturan → Unduh Backup. Ekspor Excel tersedia melalui `/api/export/excel`, PDF melalui `/api/export/pdf`.

## Hak akses

| Fitur | Admin | User |
|---|:---:|:---:|
| Dashboard, inventaris, histori barang keluar/tarikan | ✓ | ✓ |
| Barang masuk dan histori penuh | ✓ | — |
| Tambah/edit/hapus master barang | ✓ | — |
| Barang keluar dan barang tarikan | ✓ | ✓ |
| Buat/hapus akun | ✓ | — |
| Ekspor/backup | ✓ | — |
| Ganti password sendiri | ✓ | ✓ |

## Keamanan dan catatan migrasi

- Session ditandatangani HMAC-SHA256 dan disimpan pada cookie HttpOnly, SameSite=Strict, Secure saat production, dengan masa berlaku 8 jam.
- Password tidak pernah dikirim dalam endpoint daftar pengguna. Hash bcrypt lama dapat dipakai langsung.
- Tetapkan `SESSION_SECRET` yang kuat, aktifkan TLS di production, batasi akses database, dan siapkan backup PostgreSQL rutin.
- Untuk deployment multi-instance, gunakan session store terpusat (misalnya Redis/PostgreSQL) dan rate limiting terdistribusi. Session cookie bertanda tangan pada implementasi awal ini bersifat stateless.
- Versi awal Next.js ini mempertahankan alur transaksi utama, tetapi UI foto barang/foto bukti, edit foto, hapus foto khusus, unggah multi-barang dalam satu formulir, dan tampilan laporan rinci belum disamakan sepenuhnya dengan versi lama. Data path foto tetap diimpor.
- Sebelum go-live, lakukan UAT untuk transaksi paralel dan tinjau audit keamanan. Validasi transaksi menggunakan transaksi database, namun penguncian stok untuk konkurensi tinggi perlu ditambahkan (misalnya conditional update/serializable isolation).

## Struktur folder

```text
src/app/                 Halaman Next.js dan API
src/components/           Komponen antarmuka
src/lib/                  Prisma, autentikasi, helper data
prisma/schema.prisma      Skema PostgreSQL
prisma/seed.ts            Admin awal
scripts/import-excel.ts   Impor workbook Excel lama
```

## Status verifikasi paket migrasi

Arsip hasil migrasi berisi kode sumber Next.js, skema Prisma, API, antarmuka baru, dan utilitas impor. Instalasi dependensi serta build belum dapat diverifikasi di lingkungan pembuatan ini karena proses pengambilan paket npm mengalami timeout. Jalankan langkah instalasi di atas pada komputer/server yang memiliki akses registry npm, kemudian selesaikan uji build dan UAT sebelum production.

## Status verifikasi paket migrasi

Arsip hasil migrasi berisi kode sumber Next.js, skema Prisma, API, antarmuka baru, dan utilitas impor. Instalasi dependensi serta build belum dapat diverifikasi di lingkungan pembuatan ini karena proses pengambilan paket npm mengalami timeout. Jalankan langkah instalasi di atas pada komputer/server yang memiliki akses registry npm, kemudian selesaikan uji build dan UAT sebelum production.
