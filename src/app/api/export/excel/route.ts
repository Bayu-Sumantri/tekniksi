import ExcelJS from "exceljs";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const validTypes = ["all", "in", "out", "withdraw"] as const;
type HistoryType = (typeof validTypes)[number];

export async function GET(req: NextRequest) {
  try {
    await requireUser(true);

    const requestedType = req.nextUrl.searchParams.get("type");
    if (
      requestedType !== null &&
      !validTypes.includes(requestedType as HistoryType)
    ) {
      return NextResponse.json(
        { error: "Filter histori tidak valid." },
        { status: 400 },
      );
    }

    const type = requestedType as HistoryType | null;

    const [users, items, history] = await Promise.all([
      prisma.user.findMany({
        select: {
          id: true,
          username: true,
          role: true,
          createdAt: true,
        },
      }),
      prisma.item.findMany(),
      prisma.history.findMany({
        where: type && type !== "all"
          ? type === "in" ? { type: { in: ["in", "bulk_in"] } } : { type }
          : undefined,
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const workbook = new ExcelJS.Workbook();

    const sheets = [
      ["Pengguna", users],
      ["Inventaris", items],
      ["Riwayat", history],
    ] as const;

    for (const [sheetName, rows] of sheets) {
      const sheet = workbook.addWorksheet(sheetName);

      if (rows.length > 0) {
        sheet.columns = Object.keys(rows[0]).map((key) => ({
          header: key,
          key,
          width: 22,
        }));
        sheet.addRows(rows as never[]);
      }

      sheet.getRow(1).font = {
        bold: true,
        color: { argb: "FFFFFFFF" },
      };
      sheet.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF20324D" },
      };
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const suffix = type && type !== "all" ? `-${type}` : "";

    return new NextResponse(buffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition":
          `attachment; filename="laporan-tekniksi${suffix}.xlsx"`,
      },
    });
  } catch (error) {
    console.error("Export Excel gagal:", error);
    return NextResponse.json(
      { error: "Akses ditolak atau export gagal." },
      { status: 401 },
    );
  }
}
