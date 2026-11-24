import PDFDocument from "pdfkit";
import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const typeLabels: Record<string, string> = {
  all: "Semua Riwayat Aktivitas",
  in: "Riwayat Barang Masuk",
  out: "Riwayat Barang Keluar",
  withdraw: "Riwayat Barang Tarikan",
  bulk_in: "Input Massal Barang",
  edited: "Edit Barang",
  deleted: "Hapus Barang",
  adjustment: "Penyesuaian Stok",
};

export async function GET(req: NextRequest) {
  try {
    await requireUser(true);

    const type = req.nextUrl.searchParams.get("type");

    if (type !== null && !Object.hasOwn(typeLabels, type)) {
      return Response.json(
        { error: "Filter histori tidak valid." },
        { status: 400 },
      );
    }

    const doc = new PDFDocument({
      margin: 42,
      size: "A4",
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));

    const finished = new Promise<Buffer>((resolve, reject) => {
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
    });

    if (type !== null) {
      const rows = await prisma.history.findMany({
        where: type === "all" ? undefined : type === "in" ? { type: { in: ["in", "bulk_in"] } } : { type },
        orderBy: { createdAt: "desc" },
      });

      doc.fontSize(18).text(typeLabels[type]);
      doc.moveDown(0.5);
      doc.fontSize(9).text(
        `Dicetak: ${new Date().toLocaleString("id-ID")}`,
      );
      doc.text(`Total data: ${rows.length}`);
      doc.moveDown();

      for (const row of rows) {
        if (doc.y > 700) {
          doc.addPage();
        }

        doc.fontSize(10).text(`Aktivitas: ${typeLabels[row.type] || row.type}`);
        doc.fontSize(9);
        doc.text(
          `Waktu: ${new Date(row.createdAt).toLocaleString("id-ID")}`,
        );
        doc.text(`Barang: ${row.itemName}`);
        doc.text(`Jumlah: ${row.quantity}`);
        doc.text(`Perubahan stok: ${row.before} -> ${row.after}`);
        doc.text(`Oleh: ${row.createdBy}`);

        if (row.purpose) doc.text(`Keperluan: ${row.purpose}`);
        if (row.note) doc.text(`Catatan: ${row.note}`);

        doc.moveDown(0.8);
      }
    } else {
      // Tanpa parameter type, pertahankan export PDF inventaris yang lama.
      const items = await prisma.item.findMany({
        orderBy: { name: "asc" },
      });

      doc.fontSize(18).text("Laporan Inventaris Tekniksi");
      doc.moveDown();
      doc.fontSize(9).text(
        `Dicetak: ${new Date().toLocaleString("id-ID")}`,
      );
      doc.moveDown();

      for (const item of items) {
        if (doc.y > 740) doc.addPage();

        doc
          .fontSize(10)
          .text(
            `${item.name} | ${item.category || "-"} | Stok: ${item.stock}`,
          );
      }
    }

    doc.end();
    const data = await finished;
    const suffix = type && type !== "all" ? `-${type}` : "";

    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition":
          `attachment; filename="laporan-tekniksi${suffix}.pdf"`,
      },
    });
  } catch (error) {
    console.error("Export PDF gagal:", error);
    return Response.json(
      { error: "Akses ditolak atau export gagal." },
      { status: 401 },
    );
  }
}
