// import {PrismaClient} from '@prisma/client';import bcrypt from 'bcryptjs';const db=new PrismaClient();
// async function main(){if(await db.user.count())return;await db.user.create({data:{id:'USR-admin-awal',username:'admin',passwordHash:bcrypt.hashSync(process.env.INITIAL_ADMIN_PASSWORD||'admin',12),role:'admin'}});console.log('Admin awal dibuat. Segera ganti password.');}main().finally(()=>db.$disconnect());



import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

const DEMO_PASSWORD = "teknisi";
const PREFIX = "DEMO_";

const catalog = [
  ["Laptop Lenovo ThinkPad E14 Gen 5", "Komputer"],
  ["Laptop Dell Latitude 5440", "Komputer"],
  ["Laptop HP ProBook 440 G10", "Komputer"],
  ["Mini PC Intel NUC 13", "Komputer"],
  ["Desktop Workstation HP Z2", "Komputer"],
  ["Monitor LG 24MP400", "Komputer"],
  ["Monitor Dell P2422H", "Komputer"],
  ["Keyboard Logitech K120", "Komputer"],
  ["Mouse Logitech B100", "Komputer"],
  ["SSD Samsung 990 EVO 1TB", "Komputer"],
  ["RAM Kingston DDR4 16GB", "Komputer"],
  ["Hard Disk Seagate 2TB", "Komputer"],
  ["Flashdisk SanDisk 64GB", "Komputer"],
  ["USB Hub 7 Port", "Komputer"],
  ["Webcam Logitech C920", "Komputer"],

  ["Router MikroTik hEX S", "Jaringan"],
  ["Router MikroTik RB4011", "Jaringan"],
  ["Access Point TP-Link EAP610", "Jaringan"],
  ["Access Point Ubiquiti U6+", "Jaringan"],
  ["Switch TP-Link TL-SG1024", "Jaringan"],
  ["Switch Cisco CBS250-24T", "Jaringan"],
  ["Patch Panel 24 Port Cat6", "Jaringan"],
  ["Kabel UTP Cat6 Belden 305m", "Jaringan"],
  ["Fiber Optic Patch Cord LC-LC", "Jaringan"],
  ["SFP Module 1G", "Jaringan"],
  ["Keystone Jack Cat6", "Jaringan"],
  ["RJ45 Connector Cat6", "Jaringan"],
  ["Faceplate LAN 2 Port", "Jaringan"],
  ["LAN Tester Digital", "Jaringan"],
  ["USB WiFi Adapter", "Jaringan"],

  ["Crimping Tool RJ45", "Peralatan Teknisi"],
  ["Punch Down Tool", "Peralatan Teknisi"],
  ["Digital Multimeter", "Peralatan Teknisi"],
  ["Soldering Station", "Peralatan Teknisi"],
  ["Electric Drill Bosch", "Peralatan Teknisi"],
  ["Precision Screwdriver Set", "Peralatan Teknisi"],
  ["Cable Stripper", "Peralatan Teknisi"],
  ["Tang Potong Elektronik", "Peralatan Teknisi"],
  ["Heat Gun", "Peralatan Teknisi"],
  ["Label Printer Brother", "Peralatan Teknisi"],
  ["Obeng Plus Set", "Peralatan Teknisi"],
  ["Obeng Minus Set", "Peralatan Teknisi"],
  ["Cable Tester Multifungsi", "Peralatan Teknisi"],
  ["Clamp Meter Digital", "Peralatan Teknisi"],
  ["Toolkit Teknisi Lengkap", "Peralatan Teknisi"],

  ["UPS APC 1200VA", "Elektronik"],
  ["Stabilizer 1000VA", "Elektronik"],
  ["Power Supply 650W", "Elektronik"],
  ["HDMI Cable 2 Meter", "Elektronik"],
  ["VGA to HDMI Adapter", "Elektronik"],
  ["Printer Epson L3250", "Elektronik"],
  ["Scanner Canon LiDE 300", "Elektronik"],
  ["Toner HP 107A", "Elektronik"],
  ["Thermal Paste Arctic MX-4", "Elektronik"],
  ["Cooling Fan 120mm", "Elektronik"],

  ["Kertas A4 80gsm", "Perlengkapan Kantor"],
  ["Tinta Printer Epson 003", "Perlengkapan Kantor"],
  ["Label Sticker A4", "Perlengkapan Kantor"],
  ["Buku Catatan Inventaris", "Perlengkapan Kantor"],
  ["Pulpen Standard AE7", "Perlengkapan Kantor"],
  ["Map Dokumen Plastik", "Perlengkapan Kantor"],
  ["Ordner Arsip", "Perlengkapan Kantor"],
  ["Stapler HD-10", "Perlengkapan Kantor"],
  ["Lakban Bening", "Perlengkapan Kantor"],
  ["Gunting Kantor", "Perlengkapan Kantor"],

  ["Safety Helmet Proyek", "Keselamatan Kerja"],
  ["Sarung Tangan Safety", "Keselamatan Kerja"],
  ["Safety Glasses", "Keselamatan Kerja"],
  ["ESD Wrist Strap", "Keselamatan Kerja"],
  ["Masker Pelindung", "Keselamatan Kerja"],
  ["Sepatu Safety", "Keselamatan Kerja"],
  ["Rompi Safety", "Keselamatan Kerja"],
  ["Kotak P3K", "Keselamatan Kerja"],
  ["Ear Protection", "Keselamatan Kerja"],
  ["ESD Mat", "Keselamatan Kerja"],

  ["Cable Ties 20cm", "Bahan Habis Pakai"],
  ["Insulation Tape", "Bahan Habis Pakai"],
  ["Duct Tape", "Bahan Habis Pakai"],
  ["Cable Marker", "Bahan Habis Pakai"],
  ["Kabel Power 1.5m", "Bahan Habis Pakai"],
  ["Extension Cable 5 Port", "Bahan Habis Pakai"],
  ["Baterai AA Alkaline", "Bahan Habis Pakai"],
  ["Baterai AAA Alkaline", "Bahan Habis Pakai"],
  ["Fuse 5A", "Bahan Habis Pakai"],
  ["Compressed Air Cleaner", "Bahan Habis Pakai"],

  ["Rack Server 20U", "Infrastruktur"],
  ["Rack Server 12U", "Infrastruktur"],
  ["PDU Rack 8 Port", "Infrastruktur"],
  ["Cable Management Rack", "Infrastruktur"],
  ["Server Rail Kit", "Infrastruktur"],
  ["Patch Cord Cat6 1m", "Infrastruktur"],
  ["Patch Cord Cat6 3m", "Infrastruktur"],
  ["Fiber Optic ODF 12 Core", "Infrastruktur"],
  ["Kabel Fiber Optic 100m", "Infrastruktur"],
  ["Grounding Cable", "Infrastruktur"],
];

const randomInt = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const dateAfter = (days: number) =>
  new Date(Date.now() - 180 * 86400000 + days * 86400000);

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  const users = [
    { id: "DEMO_USER_001", username: "demo_admin", role: "admin" },
    { id: "DEMO_USER_002", username: "demo_teknisi01", role: "user" },
    { id: "DEMO_USER_003", username: "demo_teknisi02", role: "user" },
    { id: "DEMO_USER_004", username: "demo_operator", role: "user" },
    { id: "DEMO_USER_005", username: "demo_gudang", role: "user" },
  ];

  const items = catalog.flatMap(([name, category], index) =>
    [1, 2, 3].map((batch) => ({
      id: `DEMO_ITEM_${String(index * 3 + batch).padStart(3, "0")}`,
      name: `${name} - Batch ${String(batch).padStart(2, "0")}`,
      category,
    }))
  );

  const histories: any[] = [];
  const finalStocks = new Map<string, number>();

  function addHistory(
    item: (typeof items)[number],
    type: string,
    quantity: number,
    stock: number,
    eventIndex: number,
    itemIndex: number
  ) {
    const before = stock;
    const after =
      type === "in" || type === "withdraw"
        ? before + quantity
        : before - quantity;

    const user = users[(itemIndex + eventIndex) % users.length];

    const purposes: Record<string, string> = {
      in: "Pengadaan dan penambahan stok",
      out: "Pemakaian operasional teknisi",
      withdraw: "Pengembalian barang dari teknisi",
    };

    histories.push({
      id: `${PREFIX}HISTORY_${String(histories.length + 1).padStart(4, "0")}`,
      createdAt: dateAfter(
        itemIndex % 20 + eventIndex * 35
      ),
      type,
      itemId: item.id,
      itemName: item.name,
      quantity,
      before,
      after,
      purpose: purposes[type],
      note:
        type === "in"
          ? "Penerimaan barang dari pengadaan gudang"
          : type === "out"
            ? "Digunakan untuk kebutuhan pekerjaan lapangan"
            : "Barang dikembalikan setelah pekerjaan selesai",
      relatedId: `DEMO_TRX_${String(histories.length + 1).padStart(4, "0")}`,
      createdBy: user.username,
      imagePath: "",
      userId: user.id,
    });

    return after;
  }

  items.forEach((item, index) => {
    let stock = 0;
    let availableOut = 0;

    // Barang masuk pertama
    const firstIn = randomInt(40, 150);
    stock = addHistory(item, "in", firstIn, stock, 0, index);

    // Barang keluar
    const firstOut = randomInt(1, Math.min(15, stock));
    stock = addHistory(item, "out", firstOut, stock, 1, index);
    availableOut += firstOut;

    // Transaksi ketiga: masuk atau keluar
    if (index % 3 === 0) {
      const quantity = randomInt(5, 30);
      stock = addHistory(item, "in", quantity, stock, 2, index);
    } else {
      const quantity = randomInt(1, Math.min(10, stock));
      stock = addHistory(item, "out", quantity, stock, 2, index);
      availableOut += quantity;
    }

    // 50 riwayat tambahan berupa penarikan
    if (index < 50) {
      const quantity = randomInt(1, Math.min(5, availableOut));
      stock = addHistory(item, "withdraw", quantity, stock, 3, index);
    }

    finalStocks.set(item.id, stock);
  });

  await db.$transaction(async (tx) => {
    // Hanya membersihkan dataset demo sebelumnya
    await tx.history.deleteMany({
      where: { id: { startsWith: "DEMO_HISTORY_" } },
    });

    await tx.item.deleteMany({
      where: { id: { startsWith: "DEMO_ITEM_" } },
    });

    await tx.user.deleteMany({
      where: { id: { startsWith: "DEMO_USER_" } },
    });

    await tx.user.createMany({
      data: users.map((user) => ({
        ...user,
        passwordHash,
      })),
    });

    await tx.item.createMany({
      data: items.map((item) => ({
        ...item,
        stock: finalStocks.get(item.id)!,
        imagePath: "",
        createdAt: dateAfter(randomInt(0, 60)),
      })),
    });

    await tx.history.createMany({
      data: histories,
    });
  });

  console.log("==================================");
  console.log("DATA DEMO BERHASIL DIBUAT");
  console.log(`Akun demo : ${users.length}`);
  console.log(`Barang    : ${items.length}`);
  console.log(`Riwayat   : ${histories.length}`);
  console.log(`Password  : ${DEMO_PASSWORD}`);
  console.log("==================================");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
