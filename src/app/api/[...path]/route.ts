import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { createHmac, randomInt } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { clearSession, currentUser, isAdmin, newId, requireUser, setSession } from '@/lib/auth';
import { history, safeError } from '@/lib/data';

export const runtime = 'nodejs';
const json = (data: unknown, status = 200) => NextResponse.json(data, {
  status, headers: { 'Cache-Control': 'no-store, max-age=0', 'Pragma': 'no-cache' },
});

// Basic per-process login throttling. For multi-instance production, enforce this at the proxy/WAF too.
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
function loginBlocked(key: string) {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || entry.resetAt <= now) { loginAttempts.set(key, { count: 1, resetAt: now + 15 * 60 * 1000 }); return false; }
  entry.count += 1;
  return entry.count > 8;
}
function sameOrigin(req: NextRequest) {
  const origin = req.headers.get('origin');
  if (!origin) return true; // Non-browser clients may omit Origin; authentication still applies.
  try { return new URL(origin).host === req.headers.get('host'); } catch { return false; }
}
const fail = (error: unknown) => json(
  { error: safeError(error) },
  error instanceof Error && error.message === 'UNAUTHORIZED' ? 401
    : error instanceof Error && error.message === 'FORBIDDEN' ? 403 : 400,
);
const itemInput = z.object({
  name: z.string().trim().min(1, 'Nama barang wajib diisi.').max(100),
  category: z.string().trim().max(60).optional().default(''),
  stock: z.coerce.number().int().min(0).max(100_000_000),
});
const approvalCodeHash = (code: string) => {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error('SESSION_SECRET minimal 32 karakter.');
  // HMAC mencegah hash kode 6 digit ditebak offline hanya dari dump database.
  return createHmac('sha256', secret).update(code).digest('hex');
};

const transactionInput = z.object({
  type: z.enum(['in', 'out']),
  purpose: z.string().max(200).optional(),
  note: z.string().max(500).optional(),
  items: z.array(z.object({ itemId: z.string().min(1), quantity: z.coerce.number().int().min(1) })).min(1),
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  try {
    const { path } = await params;
    const key = path.join('/');
    if (key === 'me') return json({ user: await currentUser() });
    const user = await requireUser();

    if (key === 'data') {
      const [items, all] = await Promise.all([
        prisma.item.findMany({ orderBy: { name: 'asc' } }),
        prisma.history.findMany({ orderBy: { createdAt: 'desc' } }),
      ]);
      return json({
        items,
        alerts: items.filter((item) => item.stock <= 5).map((item) => ({ type: 'low-stock', itemId: item.id, itemName: item.name, stock: item.stock, threshold: 5 })),
        history: isAdmin(user.role) ? all : all.filter((entry) => ['out', 'withdraw'].includes(entry.type)),
        user,
      });
    }

    if (key === 'users') {
      await requireUser(true);
      return json({ users: await prisma.user.findMany({
        select: { id: true, username: true, role: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }) });
    }
    return json({ error: 'Endpoint tidak ditemukan.' }, 404);
  } catch (error) { return fail(error); }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  try {
    const { path } = await params;
    const key = path.join('/');
    if (!sameOrigin(req)) return json({ error: 'Origin tidak diizinkan.' }, 403);
    const body: unknown = await req.json();

    if (key === 'login') {
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
      if (loginBlocked(ip)) return json({ error: 'Terlalu banyak percobaan login. Coba lagi setelah 15 menit.' }, 429);
      const parsed = z.object({ username: z.string().trim().min(1).max(30), password: z.string().min(1).max(100) }).parse(body);
      const user = await prisma.user.findFirst({ where: { username: { equals: parsed.username, mode: 'insensitive' } } });
      if (!user || !await bcrypt.compare(parsed.password, user.passwordHash)) return json({ error: 'Username atau password salah.' }, 401);
      await setSession(user.id);
      return json({ user: { id: user.id, username: user.username, role: user.role } });
    }

    if (key === 'logout') {
      await requireUser();
      await clearSession();
      return json({ ok: true });
    }

    const user = await requireUser();

    if (key === 'items') {
      await requireUser(true);
      const value = itemInput.parse(body);
      const item = await prisma.$transaction(async (tx) => {
        const row = await tx.item.create({ data: { id: newId('BRG'), ...value } });
        await history(tx, { type: 'added', itemId: row.id, itemName: row.name, quantity: row.stock, before: 0, after: row.stock, purpose: 'Penambahan data barang', note: 'Barang baru ditambahkan', createdBy: user.username, userId: user.id, imagePath: row.imagePath });
        return row;
      });
      return json({ item }, 201);
    }

    if (key === 'bulk-codes') {
      if (user.role !== 'super_admin') throw new Error('FORBIDDEN');
      const superAdmin = user;
      // Kode hanya ditampilkan sekali. Database menyimpan SHA-256, bukan kode aslinya.
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 15 * 60 * 1000);
      await prisma.$transaction(async (tx) => {
        // Kode baru menggantikan kode aktif sebelumnya milik Admin Besar yang sama.
        await tx.bulkApprovalCode.updateMany({
          where: { createdByUsername: superAdmin.username, usedAt: null, expiresAt: { gt: now } },
          data: { usedAt: now },
        });
        await tx.bulkApprovalCode.create({
          data: {
            id: newId('BAC'),
            codeHash: approvalCodeHash(code),
            createdByUsername: superAdmin.username,
            createdAt: now,
            expiresAt,
          },
        });
      });
      return json({ ok: true, code, expiresAt }, 201);
    }

    if (key === 'bulk-items') {
      const admin = await requireUser(true);
      const value = z.object({
        approvalCode: z.string().regex(/^\d{6}$/, 'Kode persetujuan harus tepat 6 digit.').optional(),
        items: z.array(itemInput).min(1, 'Minimal satu barang harus diisi.').max(500, 'Maksimal 500 barang per proses.'),
      }).parse(body);
      const normalizedNames = value.items.map((item) => item.name.toLocaleLowerCase('id-ID'));
      if (new Set(normalizedNames).size !== normalizedNames.length) return json({ error: 'Nama barang tidak boleh duplikat dalam satu input massal.' }, 400);
      if (admin.role === 'admin' && !value.approvalCode) {
        return json({ error: 'Admin biasa wajib memasukkan kode persetujuan 6 digit dari Admin Besar.' }, 403);
      }

      const result = await prisma.$transaction(async (tx) => {
        let approval = null as { createdByUsername: string } | null;
        if (admin.role === 'admin') {
          const now = new Date();
          const codeHash = approvalCodeHash(value.approvalCode!);
          const storedCode = await tx.bulkApprovalCode.findUnique({ where: { codeHash } });
          if (!storedCode || storedCode.usedAt || storedCode.expiresAt <= now) {
            throw new Error('Kode persetujuan salah, sudah digunakan, atau kedaluwarsa.');
          }
          const consumed = await tx.bulkApprovalCode.updateMany({
            where: { id: storedCode.id, usedAt: null, expiresAt: { gt: now } },
            data: { usedAt: now, usedByUsername: admin.username },
          });
          if (consumed.count !== 1) throw new Error('Kode persetujuan sudah digunakan oleh proses lain.');
          approval = { createdByUsername: storedCode.createdByUsername };
        } else if (admin.role !== 'super_admin') {
          throw new Error('FORBIDDEN');
        }

        const created = [];
        const relatedId = newId('BULK');
        for (const entry of value.items) {
          const row = await tx.item.create({ data: { id: newId('BRG'), ...entry } });
          created.push(row);
          await history(tx, {
            type: 'bulk_in', itemId: row.id, itemName: row.name, quantity: row.stock,
            before: 0, after: row.stock, purpose: 'Input massal inventaris',
            note: admin.role === 'super_admin'
              ? `Input massal diproses langsung oleh Admin Besar ${admin.username}.`
              : `Input massal dilakukan Admin ${admin.username} menggunakan kode persetujuan dari Admin Besar ${approval?.createdByUsername ?? 'tidak diketahui'}.`,
            relatedId, createdBy: admin.username, userId: admin.id, imagePath: row.imagePath,
          });
        }
        return { count: created.length, relatedId };
      }, { isolationLevel: 'Serializable' });
      return json({ ok: true, ...result }, 201);
    }

    if (key === 'transactions') {
      const value = transactionInput.parse(body);
      if (value.type === 'in' && !isAdmin(user.role)) return json({ error: 'Barang masuk hanya dapat dicatat admin.' }, 403);
      if (new Set(value.items.map((line) => line.itemId)).size !== value.items.length) return json({ error: 'Barang yang sama tidak boleh dua kali.' }, 400);
      const relatedId = newId('TRX');
      await prisma.$transaction(async (tx) => {
        for (const line of value.items) {
          const item = await tx.item.findUnique({ where: { id: line.itemId } });
          if (!item) throw new Error('Barang tidak ditemukan.');
          if (value.type === 'out' && line.quantity > item.stock) throw new Error(`Stok ${item.name} tidak mencukupi (tersedia ${item.stock}).`);
          const after = item.stock + (value.type === 'in' ? line.quantity : -line.quantity);
          await tx.item.update({ where: { id: item.id }, data: { stock: after } });
          await history(tx, { type: value.type, itemId: item.id, itemName: item.name, quantity: line.quantity, before: item.stock, after, purpose: value.purpose, note: value.note, relatedId, createdBy: user.username, userId: user.id, imagePath: item.imagePath });
        }
      }, { isolationLevel: 'Serializable' });
      return json({ ok: true, count: value.items.length }, 201);
    }

    if (key === 'withdrawals') {
      const value = z.object({ reason: z.string().trim().min(1).max(500), items: z.array(z.object({ itemId: z.string(), quantity: z.coerce.number().int().min(1) })).min(1) }).parse(body);
      if (new Set(value.items.map((line) => line.itemId)).size !== value.items.length) return json({ error: 'Barang yang sama tidak boleh dua kali.' }, 400);
      const relatedId = newId('TRX');
      await prisma.$transaction(async (tx) => {
        for (const line of value.items) {
          const item = await tx.item.findUnique({ where: { id: line.itemId } });
          if (!item) throw new Error('Barang tidak ditemukan.');
          const records = await tx.history.findMany({ where: { itemId: item.id, type: { in: ['out', 'withdraw'] } } });
          const available = records.reduce((sum, row) => sum + (row.type === 'out' ? row.quantity : -row.quantity), 0);
          if (line.quantity > Math.max(0, available)) throw new Error(`Jumlah tarikan ${item.name} melebihi jumlah barang keluar yang belum ditarik (${Math.max(0, available)}).`);
          const after = item.stock + line.quantity;
          await tx.item.update({ where: { id: item.id }, data: { stock: after } });
          await history(tx, { type: 'withdraw', itemId: item.id, itemName: item.name, quantity: line.quantity, before: item.stock, after, purpose: 'Barang tarikan teknisi', note: value.reason, relatedId, createdBy: user.username, userId: user.id, imagePath: item.imagePath });
        }
      }, { isolationLevel: 'Serializable' });
      return json({ ok: true, count: value.items.length }, 201);
    }

    if (key === 'users') {
      await requireUser(true);
      const value = z.object({ username: z.string().trim().min(3).max(30).regex(/^[a-zA-Z0-9._-]+$/), password: z.string().min(10).max(100), role: z.enum(['admin', 'user']).default('user') }).parse(body);
      const created = await prisma.user.create({ data: { id: newId('USR'), username: value.username, passwordHash: await bcrypt.hash(value.password, 12), role: value.role }, select: { id: true, username: true, role: true } });
      return json({ user: created }, 201);
    }

    if (key === 'change-password') {
      const value = z.object({ oldPassword: z.string(), newPassword: z.string().min(10), confirmPassword: z.string() }).parse(body);
      if (value.newPassword !== value.confirmPassword) return json({ error: 'Konfirmasi password tidak sama.' }, 400);
      const account = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      if (!await bcrypt.compare(value.oldPassword, account.passwordHash)) return json({ error: 'Password lama salah.' }, 400);
      await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(value.newPassword, 12) } });
      return json({ ok: true });
    }
    return json({ error: 'Endpoint tidak ditemukan.' }, 404);
  } catch (error) { return fail(error); }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  try {
    const { path } = await params;
    if (!sameOrigin(_req)) return json({ error: 'Origin tidak diizinkan.' }, 403);
    const [resource, id] = path;
    const user = await requireUser(true);
    if (resource !== 'items' || !id) return json({ error: 'Endpoint tidak ditemukan.' }, 404);
    const value = itemInput.parse(await req.json());
    const item = await prisma.$transaction(async (tx) => {
      const old = await tx.item.findUniqueOrThrow({ where: { id } });
      const changed = old.name !== value.name || old.category !== value.category || old.stock !== value.stock;
      if (changed) await history(tx, {
        type: old.stock !== value.stock ? 'adjustment' : 'edited', itemId: id,
        itemName: value.name, quantity: Math.abs(value.stock - old.stock), before: old.stock,
        after: value.stock, purpose: 'Perubahan data inventaris',
        note: `Data barang diperbarui oleh ${user.username}.`, createdBy: user.username,
        userId: user.id, imagePath: old.imagePath,
      });
      return tx.item.update({ where: { id }, data: value });
    });
    return json({ item });
  } catch (error) { return fail(error); }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  try {
    if (!sameOrigin(_req)) return json({ error: 'Origin tidak diizinkan.' }, 403);
    const { path } = await params;
    const [resource, id] = path;
    const user = await requireUser(true);
    if (resource === 'items' && id) {
      await prisma.$transaction(async (tx) => {
        const item = await tx.item.findUniqueOrThrow({ where: { id } });
        await history(tx, { type: 'deleted', itemId: item.id, itemName: item.name, quantity: item.stock, before: item.stock, after: 0, purpose: 'Penghapusan barang', note: `Barang dihapus oleh ${user.username}.`, createdBy: user.username, userId: user.id, imagePath: item.imagePath });
        await tx.item.delete({ where: { id } });
      });
      return json({ ok: true });
    }
    if (resource === 'users' && id) {
      if (id === user.id) return json({ error: 'Tidak bisa menghapus akun sendiri.' }, 400);
      const target = await prisma.user.findUniqueOrThrow({ where: { id } });
      if (target.role === 'super_admin' && user.role !== 'super_admin') return json({ error: 'Hanya Admin Besar yang dapat mengelola akun Admin Besar.' }, 403);
      if (target.role === 'admin' && await prisma.user.count({ where: { role: 'admin' } }) <= 1) return json({ error: 'Minimal harus ada satu admin.' }, 400);
      await prisma.user.delete({ where: { id } });
      return json({ ok: true });
    }
    return json({ error: 'Endpoint tidak ditemukan.' }, 404);
  } catch (error) { return fail(error); }
}
