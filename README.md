# Inventaris Lokal — Sistem Inventaris Teknisi

Aplikasi inventaris berbasis web yang berjalan di komputer sendiri (`localhost`). Tidak membutuhkan Vercel, hosting, atau database online. Data utama disimpan di satu file Excel internal.

## Fitur
- Dashboard ringkasan jenis barang, total stok, stok menipis, aktivitas hari ini, dan panel peringatan stok untuk admin/pengurus.
- Login dengan dua role: **Admin** dan **User**.
- Admin dapat membuat akun Admin maupun User, menghapus akun lain, dan mengelola master barang.
- Akun User hanya dapat dibuat oleh Admin melalui menu **Pengguna**.
- User biasa dapat melihat data barang, mencatat barang keluar multi-item, mencatat barang tarikan multi-item, dan melihat histori barang keluar/tarikan.
- Tambah, edit, dan hapus master barang (khusus Admin), termasuk mengganti atau menghapus foto tanpa menghapus data barang.
- Validasi agar stok tidak minus.
- Barang tarikan menampilkan seluruh barang dari master database, menyertakan alasan, dan tidak boleh melebihi total barang yang pernah dikeluarkan dikurangi jumlah yang sudah ditarik.
- Histori aktivitas tetap tersimpan walaupun master barang dihapus.
- Password disimpan sebagai hash bcrypt di Excel, bukan teks biasa.
- Backup Excel melalui menu Histori/Pengaturan (khusus Admin).

## Menjalankan aplikasi
1. Install Node.js versi LTS dari https://nodejs.org/.
2. Ekstrak folder project.
3. Buka terminal di dalam folder project.
4. Jalankan:

   ```bash
   npm install
   npm start
   ```

5. Buka browser: http://localhost:3000

## Login awal
- Username: `admin`
- Password: `admin`

Akun awal ini dibuat otomatis saat file Excel belum memiliki akun. Segera ganti password melalui **Pengaturan → Ganti password**. Password baru minimal 10 karakter. Jika sudah pernah menggunakan database yang berisi akun admin, password yang tersimpan tidak akan ditimpa otomatis.

## Hak akses

| Fitur | Admin | User |
|---|:---:|:---:|
| Dashboard dan data barang | Ya | Ya |
| Histori barang keluar dan tarikan | Ya | Ya |
| Histori penambahan barang dan barang masuk | Ya | Tidak |
| Barang masuk | Ya | Tidak |
| Tarik barang dan tulis alasan | Ya | Ya |
| Tambah/edit/hapus master barang | Ya | Tidak |
| Buat/hapus akun | Ya | Tidak |
| Rekap PDF dan Excel | Ya | Tidak |
| Ganti password sendiri | Ya | Ya |

## Penyimpanan dan keamanan
- Database berada di `data/inventaris.xlsx` (sheet Users, Items, Riwayat). Foto disimpan terpisah dari Excel di folder `data/foto/`.
- Password pada sheet Users adalah bcrypt hash.
- Session menggunakan cookie HttpOnly dan SameSite Strict.
- Percobaan login dibatasi.
- Server hanya mendengarkan `127.0.0.1`, sehingga hanya komputer ini yang dapat mengaksesnya.
- Jangan hapus folder `data`. Buat backup Excel dan folder foto secara berkala. Backup Excel saja tidak mencakup file foto.
- Hentikan server dengan `Ctrl+C`.

## Catatan
Excel digunakan sebagai penyimpanan lokal satu komputer. Jangan jalankan beberapa salinan server yang mengakses file Excel yang sama secara bersamaan. Untuk penggunaan dari banyak komputer secara bersamaan diperlukan database server.


Foto dikompres menjadi JPEG di browser sebelum dikirim ke server. Susunan folder foto:

```text
data/
├── inventaris.xlsx          # Data barang, stok, user, dan histori
└── foto/
    ├── barang/               # Foto master barang
    ├── barang-tarikan/       # Foto kondisi barang yang ditarik/dikembalikan
    └── aktivitas/            # Foto aktivitas lain bila digunakan
```

Kolom `imagePath` di Excel hanya menyimpan alamat relatif foto, bukan isi gambar. Saat foto master diganti, sistem menyimpan foto baru, memperbarui referensi di Excel, lalu menghapus file foto lama. Saat foto dihapus, referensi histori yang menunjuk foto master tersebut ikut dikosongkan dan file lama dihapus. Foto bukti tarikan disimpan terpisah dan tidak ikut terhapus saat foto master barang diganti. Foto dari versi lama di `data/uploads/` dipindahkan otomatis ke folder kategori saat aplikasi pertama kali dijalankan.

Peringatan stok menggunakan batas awal **5 unit atau kurang** dan tampil di dashboard admin/pengurus. Error dari server ditulis ke terminal; kegagalan proses di browser ditampilkan sebagai notifikasi. Notifikasi ini bersifat di dalam aplikasi, belum mengirim WhatsApp atau email.

Rekap admin dapat diunduh langsung sebagai Excel (foto tertanam) dan PDF. Untuk backup lengkap, salin `data/inventaris.xlsx` beserta seluruh folder `data/foto/`.

## Alur kode dan penyimpanan
1. `public/app.js` membaca foto yang dipilih, mengubah ukurannya melalui `compressImage()`, lalu mengirim JPEG sebagai `imageDataUrl`.
2. `server.js` memvalidasi format dan ukuran melalui `saveImageDataUrl()`, kemudian menyimpan file ke folder berdasarkan kategori.
3. ExcelJS menyimpan alamat file pada kolom `Items.imagePath` atau `History.imagePath`; file gambar tidak dimasukkan ke workbook utama.
4. Saat foto barang diganti/dihapus, server memperbarui workbook lebih dulu. Setelah berhasil, file foto master lama dihapus. Foto histori tarikan yang berbeda tetap aman.
5. Gambar dilayani dari endpoint `/foto/...`; laporan Excel/PDF membaca file fisik berdasarkan alamat relatif tersebut.
6. `GET /api/data` mengirim daftar barang dan peringatan stok. `public/app.js` menampilkan peringatan itu di panel khusus admin.
7. Jika terjadi error API, server mencatat detail di terminal dan UI menampilkan pesan yang bisa dibaca pengguna.

## Migrasi database Excel lama

Saat startup, aplikasi memeriksa nama worksheet pada `data/inventaris.xlsx`. Jika ditemukan nama sheet lama `History` (nama yang ditolak ExcelJS), aplikasi otomatis menggantinya menjadi `Riwayat` langsung di dalam paket XLSX sebelum membaca data. Isi sel, gambar, dan relasi workbook dipertahankan. Pada Ubuntu/WSL, pastikan `python3` tersedia (`python3 --version`).

## Peta file kode
- `server.js`: API login/role, validasi stok, pembacaan/penulisan Excel, pengelolaan folder foto, migrasi foto lama, dan laporan.
- `public/app.js`: alur antarmuka, kompresi foto, pratinjau, form multi-barang, notifikasi, dan panel stok menipis.
- `public/index.html`: struktur halaman, menu, form, tabel, dan dialog.
- `public/style.css`: tampilan responsif dan komponen UI; tidak memakai framework UI tambahan.
- `scripts/repair-history-sheet.py`: perbaikan nama worksheet `History` dari versi database lama agar bisa dibaca ExcelJS.
