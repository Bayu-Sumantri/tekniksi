import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
const prisma = new PrismaClient();
const file = process.argv[2] || "../data/inventaris.xlsx";
function val(v: ExcelJS.CellValue): string | number {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object" && "text" in v) return v.text;
  if (typeof v === "object" && "result" in v) return String(v.result ?? "");
  return v as string | number;
}
async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const find = (...names: string[]) =>
    wb.worksheets.find((s) => names.includes(s.name));
  const users = find("Users"),
    items = find("Items"),
    history = find("Riwayat", "History");
  const count = { users: 0, items: 0, history: 0 };
  if (users)
    for (let i = 2; i <= users.rowCount; i++) {
      const r = users.getRow(i);
      const [id, username, passwordHash, role, createdAt] = [1, 2, 3, 4, 5].map(
        (c) => val(r.getCell(c).value),
      );
      if (!id || !username || !passwordHash) continue;
      await prisma.user.upsert({
        where: { id: String(id) },
        create: {
          id: String(id),
          username: String(username),
          passwordHash: String(passwordHash),
          role: String(role || "user"),
          createdAt: createdAt ? new Date(String(createdAt)) : new Date(),
        },
        update: {
          username: String(username),
          passwordHash: String(passwordHash),
          role: String(role || "user"),
        },
      });
      count.users++;
    }
  if (items)
    for (let i = 2; i <= items.rowCount; i++) {
      const r = items.getRow(i);
      const [id, name, category, stock, imagePath, createdAt, updatedAt] = [
        1, 2, 3, 4, 5, 6, 7,
      ].map((c) => val(r.getCell(c).value));
      if (!id || !name) continue;
      await prisma.item.upsert({
        where: { id: String(id) },
        create: {
          id: String(id),
          name: String(name),
          category: String(category || ""),
          stock: Number(stock || 0),
          imagePath: String(imagePath || ""),
          createdAt: createdAt ? new Date(String(createdAt)) : new Date(),
          updatedAt: updatedAt ? new Date(String(updatedAt)) : new Date(),
        },
        update: {
          name: String(name),
          category: String(category || ""),
          stock: Number(stock || 0),
          imagePath: String(imagePath || ""),
        },
      });
      count.items++;
    }
  if (history)
    for (let i = 2; i <= history.rowCount; i++) {
      const r = history.getRow(i);
      const [
        id,
        createdAt,
        type,
        itemId,
        itemName,
        quantity,
        before,
        after,
        purpose,
        note,
        relatedId,
        createdBy,
        imagePath,
      ] = Array.from({ length: 13 }, (_, n) => val(r.getCell(n + 1).value));
      if (!id || !itemName) continue;
      const item = await prisma.item.findUnique({
        where: { id: String(itemId) },
        select: { id: true },
      });
      await prisma.history.upsert({
        where: { id: String(id) },
        create: {
          id: String(id),
          createdAt: createdAt ? new Date(String(createdAt)) : new Date(),
          type: String(type || "adjustment"),
          itemId: item?.id ?? null,
          itemName: String(itemName),
          quantity: Number(quantity || 0),
          before: Number(before || 0),
          after: Number(after || 0),
          purpose: String(purpose || ""),
          note: String(note || ""),
          relatedId: String(relatedId || ""),
          createdBy: String(createdBy || "legacy"),
          imagePath: String(imagePath || ""),
        },
        update: {},
      });
      count.history++;
    }
  console.log("Impor selesai:", count);
  console.log(
    "Password hash bcrypt dipertahankan. Salin juga folder foto lama ke public/uploads/legacy dan sesuaikan imagePath bila diperlukan.",
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
