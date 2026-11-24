# Tekniksi — Sistem Informasi Inventaris Teknisi

Aplikasi inventaris berbasis web untuk mengelola data barang, stok, aktivitas barang masuk/keluar, barang tarikan, histori, dan akun pengguna.

> **Status data contoh:** paket seed skala besar yang direncanakan menghasilkan 10.000 data barang dan sekitar 45.000 histori merupakan data simulasi untuk pengujian/demo, bukan catatan inventaris nyata. Jangan gunakan data simulasi sebagai data operasional.

## Daftar Isi

- [Fitur](#fitur)
- [Teknologi](#teknologi)
- [Persyaratan](#persyaratan)
- [Persiapan PostgreSQL](#persiapan-postgresql)
- [Instalasi](#instalasi)
- [Konfigurasi Environment](#konfigurasi-environment)
- [Menyiapkan Database dengan Prisma](#menyiapkan-database-dengan-prisma)
- [Menjalankan Aplikasi](#menjalankan-aplikasi)
- [Build Production](#build-production)
- [Pengisian Data Contoh Skala Besar](#pengisian-data-contoh-skala-besar)
- [Menjaga Akun Admin dan User](#menjaga-akun-admin-dan-user)
- [Backup dan Restore](#backup-dan-restore)
- [Troubleshooting](#troubleshooting)
- [Keamanan](#keamanan)

## Fitur

- Dashboard ringkasan inventaris.
- Pengelolaan data barang dan stok.
- Pencatatan barang masuk dan barang keluar.
- Pengelolaan barang tarikan.
- Histori aktivitas inventaris.
- Login dan hak akses berdasarkan role.
- Kode persetujuan untuk proses tertentu (jika fitur tersebut tersedia pada versi source yang digunakan).
- Database relasional PostgreSQL melalui Prisma ORM.

Nama menu dan ketersediaan fitur mengikuti versi source code yang dipasang.

## Teknologi

- Next.js 15
- React 19
- TypeScript
- PostgreSQL
- Prisma ORM 6
- Tailwind CSS
- bcryptjs
- Lucide React

## Persyaratan

Pastikan perangkat sudah memiliki:

1. Node.js versi LTS yang kompatibel dengan Next.js 15 (disarankan Node.js 20.9 atau lebih baru).
2. npm (biasanya sudah ikut terpasang bersama Node.js).
3. PostgreSQL 14 atau lebih baru.
4. Git (opsional, jika mengambil source dari repository).

Periksa instalasi:

```bash
node -v
npm -v
psql --version
```

## Persiapan PostgreSQL

Buat database dan user khusus aplikasi. Masuk ke PostgreSQL sebagai administrator:

```bash
sudo -u postgres psql
```

Jalankan SQL berikut dan ganti password contoh dengan password kuat milik sendiri:

```sql
CREATE USER tekniksi_user WITH PASSWORD 'GANTI_DENGAN_PASSWORD_KUAT';
CREATE DATABASE tekniksi OWNER tekniksi_user;
GRANT ALL PRIVILEGES ON DATABASE tekniksi TO tekniksi_user;
\q
```

Uji koneksi:

```bash
psql "postgresql://tekniksi_user:GANTI_DENGAN_PASSWORD_KUAT@localhost:5432/tekniksi"
```

Jika berhasil masuk ke prompt `tekniksi=>`, keluar dengan `\q`.

## Instalasi

### 1. Masuk ke folder project

Jika source sudah diunduh atau diekstrak:

```bash
cd /lokasi/folder/tekniksi
```

Pastikan `package.json` ada:

```bash
ls -la
```

### 2. Pasang dependency

```bash
npm install
```

### 3. Siapkan file environment

Buat `.env` di root project (sejajar dengan `package.json`):

```bash
nano .env
```

Isi variabel minimal berikut. Sesuaikan dengan nama variabel yang benar-benar dibaca oleh source code project:

```env
DATABASE_URL="postgresql://tekniksi_user:GANTI_DENGAN_PASSWORD_KUAT@localhost:5432/tekniksi?schema=public"
```

Simpan file. Jangan unggah `.env` ke GitHub dan jangan membagikan password database.

> Jika source menyediakan `.env.example`, jadikan file tersebut acuan utama. Tambahkan hanya variabel yang memang digunakan aplikasi; jangan menebak secret atau URL layanan lain.

## Menyiapkan Database dengan Prisma

Periksa schema:

```bash
npx prisma validate
```

Buat tabel database dari migration yang tersedia:

```bash
npx prisma migrate deploy
```

Jika project belum memiliki migration dan ini adalah database development yang masih kosong, buat migration awal:

```bash
npx prisma migrate dev --name init
```

Generate Prisma Client:

```bash
npx prisma generate
```

Buka Prisma Studio untuk melihat tabel dan data:

```bash
npx prisma studio
```

Jangan menjalankan `migrate dev` pada database production. Untuk production gunakan migration yang sudah dibuat dan `npx prisma migrate deploy`.

## Menjalankan Aplikasi

Mode development:

```bash
npm run dev
```

Buka browser:

```text
http://localhost:3000
```

Hentikan server dengan `Ctrl + C`.

Untuk memeriksa script yang tersedia:

```bash
npm run
```

## Build Production

```bash
npx prisma generate
npm run build
npm run start
```

Aplikasi production secara default berjalan di `http://localhost:3000`. Pastikan environment production sudah diatur di server hosting dan database dapat dijangkau dari server tersebut.

## Pengisian Data Contoh Skala Besar

Seed skala besar yang dimaksud dalam pengembangan ini ditargetkan membuat **10.000 record barang** dan sekitar **45.000 record histori**. Angka histori dapat berubah sesuai implementasi final seed. Data tersebut adalah data sintetis untuk uji performa, pagination, pencarian, filter, dan tampilan dashboard.

**Peringatan:** seed reset akan menghapus seluruh record pada tabel `Item` dan `History` sebelum membuat data baru. Operasi ini tidak boleh dijalankan pada database yang berisi data inventaris asli kecuali memang sudah dicadangkan dan pengguna menyetujui penggantian tersebut.

Sebelum menjalankan seed:

1. Pastikan `DATABASE_URL` mengarah ke database yang benar.
2. Buat backup database.
3. Pastikan akun admin/user yang ingin dipertahankan memang sudah ada di tabel `User`.
4. Baca implementasi `prisma/seed.ts` dan pastikan script hanya menghapus `Item` dan `History`, bukan `User`.
5. Jalankan seed hanya setelah memastikan target database bukan database production berisi data nyata.

Jika `package.json` telah mengatur perintah seed Prisma, jalankan:

```bash
npx prisma db seed
```

Jika belum ada konfigurasi seed, periksa `package.json` dan `prisma/seed.ts` terlebih dahulu. Konfigurasi perintah seed bergantung pada versi Prisma dan konfigurasi project; jangan menambahkan perintah secara asal.

Setelah proses selesai, verifikasi jumlah record menggunakan Prisma Studio atau SQL:

```sql
SELECT COUNT(*) AS total_users FROM "User";
SELECT COUNT(*) AS total_items FROM "Item";
SELECT COUNT(*) AS total_histories FROM "History";
```

Jumlah `User` sebelum dan sesudah seed harus sama. Untuk target seed ini, jumlah `Item` yang diharapkan adalah 10.000. Jumlah `History` mengikuti hasil aktual seed.

## Menjaga Akun Admin dan User

Desain reset data contoh yang diminta adalah:

| Tabel | Tindakan |
|---|---|
| `User` | Dipertahankan; tidak dihapus, dibuat ulang, atau diubah oleh seed reset |
| `Item` | Data lama dihapus lalu diganti data contoh baru |
| `History` | Histori lama dihapus lalu diganti histori contoh baru |
| `BulkApprovalCode` | Tidak boleh ikut dihapus kecuali memang ada instruksi dan alasan khusus |

Pastikan implementasi seed menggunakan transaksi database agar jika pembuatan data gagal, penghapusan sebelumnya ikut dibatalkan. Gunakan batch insert agar jumlah data besar tidak dikirim dalam satu operasi raksasa.

## Backup dan Restore

### Backup

```bash
pg_dump -h localhost -U tekniksi_user -d tekniksi -F c -f tekniksi-backup.dump
```

### Restore

Buat database tujuan kosong, lalu:

```bash
createdb -h localhost -U tekniksi_user tekniksi_restore
pg_restore -h localhost -U tekniksi_user -d tekniksi_restore --clean --if-exists tekniksi-backup.dump
```

Simpan file backup di lokasi aman. Jangan commit file backup ke repository publik.

## Troubleshooting

### `P1001: Can't reach database server`

- Pastikan service PostgreSQL berjalan:

  ```bash
  sudo systemctl status postgresql
  ```
- Pastikan host, port, username, password, dan nama database pada `DATABASE_URL` benar.
- Pastikan PostgreSQL menerima koneksi dari host aplikasi.

### `P1000: Authentication failed`

Password atau username PostgreSQL salah. Uji koneksi langsung menggunakan `psql`, lalu perbarui `.env`.

### `Prisma Client did not initialize` atau model tidak ditemukan

Jalankan:

```bash
npx prisma generate
```

Pastikan schema yang digunakan adalah `prisma/schema.prisma`.

### Tabel belum tersedia

Jalankan migration:

```bash
npx prisma migrate deploy
```

Untuk database development baru tanpa migration, gunakan `npx prisma migrate dev --name init`.

### Port 3000 sedang digunakan

Jalankan Next.js pada port lain:

```bash
npm run dev -- --port 3001
```

Kemudian buka `http://localhost:3001`.

### Login gagal

- Pastikan akun memang ada di tabel `User`.
- Pastikan password diverifikasi menggunakan mekanisme hash yang sesuai dengan aplikasi.
- Jangan mengubah password hash secara manual tanpa memahami format yang dipakai.
- Jangan membuat akun admin baru jika tujuanmu hanya mengganti data barang.

### Seed gagal di tengah proses

- Periksa pesan error lengkap di terminal.
- Periksa koneksi dan kapasitas database.
- Pastikan seed menggunakan transaksi dan batch insert.
- Verifikasi kembali jumlah data. Jangan mengulang seed sebelum memahami apakah transaksi sebelumnya rollback atau sudah commit.

## Keamanan

- Gunakan password database yang kuat dan unik.
- Jangan commit `.env`, credential, dump database, atau service-role key ke Git.
- Batasi akses database hanya untuk host yang diperlukan.
- Aktifkan HTTPS pada deployment publik.
- Buat backup sebelum migration atau seed yang menghapus data.
- Gunakan data simulasi hanya untuk development, staging, atau pengujian.
- Jangan menaruh password akun dalam README.

## Struktur Project (umum)

```text
tekniksi/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── src/
│   ├── app/
│   └── components/
├── public/
├── .env
├── package.json
└── README.md
```

Struktur aktual dapat berbeda sesuai versi repository.

## Lisensi dan Kontribusi

Sesuaikan bagian lisensi, pemilik project, dan panduan kontribusi dengan kebijakan repository yang digunakan.


## Reset data inventaris (akun pengguna tetap)

Script ini menghapus seluruh baris `History`, `Item`, dan `BulkApprovalCode`, tetapi **tidak menghapus atau mengubah tabel `User`**. Jalankan hanya setelah membuat backup PostgreSQL.

```bash
pg_dump -Fc -d "$DATABASE_URL" -f tekniksi-before-reset.dump
CONFIRM_CLEAR_INVENTORY=YES npm run db:clear-inventory-keep-users
```

Perintah di atas bersifat destruktif untuk data inventaris dan histori. Pastikan `DATABASE_URL` menunjuk database yang benar. Setelah reset, semua akun pengguna yang sudah ada tetap tersedia; kode persetujuan massal yang lama ikut dihapus agar tidak dapat digunakan kembali.

## Catatan keamanan dan performa

- Cookie sesi menggunakan `HttpOnly`, `SameSite=Strict`, `Secure` pada production, dan masa berlaku terbatas.
- API mutasi memeriksa header `Origin` bila tersedia dan respons API diberi `Cache-Control: no-store`.
- Header keamanan dasar aktif melalui konfigurasi Next.js. Login memiliki throttling sederhana per proses; untuk deployment multi-instance, tambahkan rate limiting pada reverse proxy/WAF atau Redis.
- Gunakan HTTPS, `SESSION_SECRET` acak minimal 32 karakter, password kuat, PostgreSQL tidak diekspos ke internet, dan jangan commit `.env`.
- Tidak ada jaminan aplikasi kebal dari semua serangan; lakukan audit dependency, backup, pemantauan log, dan pengujian sebelum production.
- Layout memiliki aturan responsive, tabel dapat digeser horizontal pada layar kecil, dan halaman menampilkan skeleton saat data awal dimuat.


## Deploy ke Cloudflare Workers (OpenNext + PostgreSQL Hyperdrive)

Project ini disiapkan untuk Cloudflare Workers menggunakan OpenNext dan Prisma 6 dengan PostgreSQL driver adapter. Database PostgreSQL yang hanya berjalan di laptop (`localhost`) **tidak dapat diakses oleh Worker publik**. Untuk production, gunakan PostgreSQL yang memiliki endpoint jaringan publik/terkelola (misalnya Neon atau Supabase), lalu hubungkan melalui Cloudflare Hyperdrive.

### 1. Siapkan database production

- Buat PostgreSQL terkelola di provider pilihan.
- Backup database lokal terlebih dahulu sebelum memindahkan data.
- Import backup ke database tujuan dan verifikasi tabel `User`, `Item`, `History`, dan `BulkApprovalCode`.
- Jangan jalankan reset/seed demo pada database yang berisi data asli.

### 2. Install dan tes lokal

```bash
npm install
cp .dev.vars.example .dev.vars
# Edit .dev.vars dan isi DATABASE_URL serta SESSION_SECRET milik sendiri
npx prisma generate
npm run preview
```

### 3. Buat Hyperdrive

Buat konfigurasi Hyperdrive dari connection string PostgreSQL production:

```bash
read -rsp 'PostgreSQL connection string: ' DB_URL; echo
npx wrangler hyperdrive create tekniksi-db --connection-string="$DB_URL"
unset DB_URL
```

Salin ID yang dikembalikan, lalu ganti `REPLACE_WITH_HYPERDRIVE_ID` pada bagian `hyperdrive` di `wrangler.jsonc`. Jangan menaruh password database ke file konfigurasi atau Git. Hyperdrive menyimpan konfigurasi koneksi di sisi Cloudflare.

### 4. Atur secret Worker

```bash
npx wrangler secret put SESSION_SECRET
```

Masukkan secret acak minimal 32 karakter, misalnya hasil `openssl rand -base64 48`. Jangan commit `.env`, `.dev.vars`, atau kredensial.

### 5. Terapkan migration dan deploy

Jalankan migration production dari lingkungan tepercaya yang memiliki `DATABASE_URL` menuju database production:

```bash
npx prisma migrate deploy
```

Pastikan backup sudah tersedia dan `DATABASE_URL` menunjuk database tujuan yang benar. Perintah ini menerapkan migration yang ada; jangan gunakan `migrate reset`.

Kemudian deploy:

```bash
npm run deploy
```

Worker akan menggunakan binding `HYPERDRIVE` untuk query PostgreSQL. Nama Worker dan self-reference sudah disamakan menjadi `tekniksi`.

### Catatan penting

- Setelah membuat Hyperdrive, tambahkan binding berikut di root `wrangler.jsonc` dan isi ID yang dikembalikan:

```jsonc
"hyperdrive": [{ "binding": "HYPERDRIVE", "id": "ID_DARI_WRANGLER" }],
```

- Jangan deploy production sebelum binding Hyperdrive sudah ditambahkan dan database production sudah berisi migration serta data yang diperlukan.
- Database lokal tetap bisa dipakai untuk pengembangan melalui `DATABASE_URL`, tetapi tidak menjadi database publik Cloudflare.
- Migrasi data dari PostgreSQL lokal ke provider cloud adalah langkah terpisah; file source ini tidak menghapus atau memindahkan database secara otomatis.
- Pastikan binding `HYPERDRIVE` tersedia di Worker production.
