'use strict';

const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const HOST = '127.0.0.1';
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'inventaris.xlsx');
const SECRET_FILE = path.join(DATA_DIR, '.session-secret');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads'); // kompatibilitas foto dari versi lama
const PHOTO_DIRS = {
  barang: path.join(DATA_DIR, 'foto', 'barang'),
  tarikan: path.join(DATA_DIR, 'foto', 'barang-tarikan'),
  aktivitas: path.join(DATA_DIR, 'foto', 'aktivitas')
};
fs.mkdirSync(UPLOAD_DIR, { recursive: true, mode: 0o700 });
for (const directory of Object.values(PHOTO_DIRS)) fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
const SESSION_NAME = 'inventaris.sid';
const SESSION_MAX_AGE = 8 * 60 * 60 * 1000;

const SCHEMA = {
  Users: ['id', 'username', 'passwordHash', 'role', 'createdAt'],
  Items: ['id', 'name', 'category', 'stock', 'imagePath', 'createdAt', 'updatedAt'],
  History: [
    'id', 'createdAt', 'type', 'itemId', 'itemName', 'quantity',
    'before', 'after', 'purpose', 'note', 'relatedId', 'createdBy', 'imagePath'
  ]
};

// ExcelJS melindungi nama worksheet "History". Nama internal database tetap
// History agar API dan proses transaksi tidak berubah; nama tab Excel menjadi "Riwayat".
const WORKSHEET_NAMES = {
  Users: 'Users',
  Items: 'Items',
  History: 'Riwayat'
};

let databaseQueue = Promise.resolve();
let historySheetMigrationChecked = false;

function createId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function loadSessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;

  try {
    if (fs.existsSync(SECRET_FILE)) {
      const saved = fs.readFileSync(SECRET_FILE, 'utf8').trim();
      if (saved.length >= 32) return saved;
    }

    const generated = crypto.randomBytes(48).toString('hex');
    fs.writeFileSync(SECRET_FILE, generated, { mode: 0o600 });
    return generated;
  } catch (error) {
    console.error('Tidak bisa menyiapkan session secret:', error.message);
    return crypto.randomBytes(48).toString('hex');
  }
}

fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
const SESSION_SECRET = loadSessionSecret();

app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"]
    }
  }
}));
app.use(express.json({ limit: '12mb' }));
app.use(session({
  name: SESSION_NAME,
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: 'strict',
    secure: false,
    maxAge: SESSION_MAX_AGE
  }
}));

function normalizeCell(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if (Object.prototype.hasOwnProperty.call(value, 'text')) return value.text;
    if (Object.prototype.hasOwnProperty.call(value, 'result')) return value.result ?? '';
    if (Object.prototype.hasOwnProperty.call(value, 'hyperlink')) return value.text || value.hyperlink;
    return '';
  }
  return value;
}

function normalizeRow(sheet, row) {
  const values = {};
  for (const field of SCHEMA[sheet]) {
    values[field] = normalizeCell(row.getCell(field).value);
  }
  if (sheet === 'Items') values.stock = Number(values.stock || 0);
  if (sheet === 'History') {
    for (const field of ['quantity', 'before', 'after']) values[field] = Number(values[field] || 0);
  }
  return values;
}

function repairProtectedHistorySheetName() {
  if (historySheetMigrationChecked || !fs.existsSync(DB_FILE)) return;

  // ExcelJS refuses to open workbooks containing a worksheet named exactly
  // 'History'. Older app versions created that tab, so rename it inside the
  // XLSX package before ExcelJS parses it. This preserves all cell data.
  const repairScript = path.join(__dirname, 'scripts', 'repair-history-sheet.py');
  const result = spawnSync('python3', [repairScript, DB_FILE], { encoding: 'utf8' });
  if (result.error) {
    throw new Error(`Tidak bisa menjalankan migrasi nama sheet Excel (python3): ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`Gagal memperbaiki nama sheet Excel: ${(result.stderr || result.stdout || 'unknown error').trim()}`);
  }
  if (result.stdout && result.stdout.trim()) console.log(result.stdout.trim());
  historySheetMigrationChecked = true;
}

async function readDatabaseRaw() {
  if (!fs.existsSync(DB_FILE)) return emptyDatabase();

  repairProtectedHistorySheetName();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(DB_FILE);
  const database = emptyDatabase();

  for (const [sheetName, fields] of Object.entries(SCHEMA)) {
    const worksheetName = WORKSHEET_NAMES[sheetName] || sheetName;
    const worksheet = workbook.worksheets.find(sheet => sheet.name === worksheetName);
    if (!worksheet || worksheet.rowCount < 2) continue;

    const headerMap = new Map();
    worksheet.getRow(1).eachCell((cell, columnNumber) => {
      headerMap.set(String(normalizeCell(cell.value)).trim(), columnNumber);
    });

    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const sourceRow = worksheet.getRow(rowNumber);
      if (sourceRow.cellCount === 0) continue;
      const row = {};
      for (const field of fields) {
        const columnNumber = headerMap.get(field);
        row[field] = columnNumber ? normalizeCell(sourceRow.getCell(columnNumber).value) : '';
      }
      if (Object.values(row).some(value => value !== '')) {
        database[sheetName].push(normalizeRow(sheetName, {
          getCell: field => ({ value: row[field] })
        }));
      }
    }
  }

  return database;
}

function emptyDatabase() {
  return { Users: [], Items: [], History: [] };
}

async function writeDatabase(database) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Inventaris Lokal';
  workbook.lastModifiedBy = 'Inventaris Lokal';
  workbook.created = new Date();
  workbook.modified = new Date();

  for (const [sheetName, fields] of Object.entries(SCHEMA)) {
    const worksheet = workbook.addWorksheet(WORKSHEET_NAMES[sheetName] || sheetName);
    worksheet.columns = fields.map(field => ({
      header: field,
      key: field,
      width: Math.max(16, Math.min(34, field.length + 8))
    }));
    worksheet.addRows((database[sheetName] || []).map(row => {
      const result = {};
      for (const field of fields) result[field] = row[field] ?? '';
      return result;
    }));

    worksheet.views = [{ state: 'frozen', ySplit: 1 }];
    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: Math.max(1, worksheet.rowCount), column: fields.length }
    };
    const header = worksheet.getRow(1);
    header.height = 22;
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF20324D' } };
    header.alignment = { vertical: 'middle' };
  }

  const tempFile = path.join(DATA_DIR, `inventaris-${process.pid}-${crypto.randomUUID()}.tmp.xlsx`);
  try {
    await workbook.xlsx.writeFile(tempFile);
    fs.chmodSync(tempFile, 0o600);
    await fs.promises.rename(tempFile, DB_FILE);
    try { fs.chmodSync(DB_FILE, 0o600); } catch { /* File permissions may differ on Windows. */ }
  } catch (error) {
    try { fs.unlinkSync(tempFile); } catch { /* Temporary file may not exist. */ }
    throw error;
  }
}

function readDatabase() {
  const pendingWrite = databaseQueue;
  return pendingWrite.then(() => readDatabaseRaw());
}

function updateDatabase(mutator) {
  const operation = databaseQueue.then(async () => {
    const database = await readDatabaseRaw();
    const result = await mutator(database);
    await writeDatabase(database);
    return result;
  });
  databaseQueue = operation.catch(() => undefined);
  return operation;
}

function safeUser(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    createdAt: user.createdAt
  };
}

function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Sesi berakhir. Silakan login kembali.' });
  }
  return next();
}

function requireAdmin(req, res, next) {
  if (req.session.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Fitur ini hanya dapat digunakan oleh admin.' });
  }
  return next();
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function isValidUsername(username) {
  return typeof username === 'string' && /^[a-zA-Z0-9_.-]{3,30}$/.test(username.trim());
}

function isValidPassword(password, minimum = 6) {
  return typeof password === 'string' && password.length >= minimum && password.length <= 100;
}

function saveImageDataUrl(dataUrl, category = 'aktivitas') {
  if (!dataUrl) return '';
  if (!Object.hasOwn(PHOTO_DIRS, category)) throw new Error('Kategori penyimpanan foto tidak valid.');
  if (typeof dataUrl !== 'string' || dataUrl.length > 900000) throw new Error('Foto terlalu besar. Pilih foto yang lebih kecil.');
  const match = dataUrl.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error('Format foto tidak didukung. Gunakan JPG, PNG, atau WebP.');
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > 650000) throw new Error('Ukuran foto setelah kompres maksimal 650 KB.');
  const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
  const filename = `${category}-${crypto.randomUUID()}.${ext}`;
  fs.writeFileSync(path.join(PHOTO_DIRS[category], filename), buffer, { mode: 0o600, flag: 'wx' });
  return `/foto/${category}/${filename}`;
}

function resolveImageFile(imagePath) {
  if (typeof imagePath !== 'string' || !imagePath) return '';
  const match = imagePath.match(/^\/foto\/(barang|tarikan|aktivitas)\/([a-zA-Z0-9._-]+)$/);
  if (match && match[2] !== '.' && match[2] !== '..') {
    const target = path.resolve(PHOTO_DIRS[match[1]], match[2]);
    return target.startsWith(`${path.resolve(PHOTO_DIRS[match[1]])}${path.sep}`) ? target : '';
  }
  // Path /uploads dari database versi lama tetap bisa dibaca sampai foto dimigrasikan.
  if (imagePath.startsWith('/uploads/')) {
    const target = path.resolve(UPLOAD_DIR, path.basename(imagePath));
    return target.startsWith(`${path.resolve(UPLOAD_DIR)}${path.sep}`) ? target : '';
  }
  return '';
}

function deleteImageFile(imagePath) {
  const fullPath = resolveImageFile(imagePath);
  if (fullPath && fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
}

function imageDataForReport(imagePath) {
  const fullPath = resolveImageFile(imagePath);
  if (!fullPath || !fs.existsSync(fullPath)) return '';
  const ext = path.extname(fullPath).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  return `data:${mime};base64,${fs.readFileSync(fullPath).toString('base64')}`;
}

function addHistory(database, data, user) {
  database.History.push({
    id: createId('TRX'),
    createdAt: new Date().toISOString(),
    relatedId: '',
    purpose: '',
    note: '',
    imagePath: '',
    ...data,
    createdBy: user.username
  });
}

function createSession(req, res, user) {
  req.session.regenerate(error => {
    if (error) return res.status(500).json({ error: 'Tidak bisa membuat sesi login.' });
    req.session.user = safeUser(user);
    return req.session.save(saveError => {
      if (saveError) return res.status(500).json({ error: 'Tidak bisa menyimpan sesi login.' });
      return res.json({ user: req.session.user });
    });
  });
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Terlalu banyak percobaan login. Coba lagi dalam 15 menit.' }
});

// Migrasikan foto dari folder uploads lama ke folder kategori tanpa mengubah isi foto.
async function migrateLegacyPhotoFolders(database) {
  const moved = new Map();
  const oldPaths = new Set();
  let changed = false;
  const migratePath = (oldPath, category) => {
    if (typeof oldPath !== 'string' || !oldPath.startsWith('/uploads/')) return oldPath || '';
    oldPaths.add(oldPath);
    changed = true;
    if (moved.has(oldPath)) return moved.get(oldPath);
    const source = resolveImageFile(oldPath);
    if (!source || !fs.existsSync(source)) { moved.set(oldPath, ''); return ''; }
    const ext = path.extname(source).toLowerCase() || '.jpg';
    const filename = `${category}-${crypto.randomUUID()}${ext}`;
    const destination = path.join(PHOTO_DIRS[category], filename);
    fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
    try { fs.chmodSync(destination, 0o600); } catch { /* Izin file mengikuti sistem operasi. */ }
    const nextPath = `/foto/${category}/${filename}`;
    moved.set(oldPath, nextPath);
    changed = true;
    return nextPath;
  };

  for (const item of database.Items) {
    if (item.imagePath?.startsWith('/uploads/')) item.imagePath = migratePath(item.imagePath, 'barang');
  }
  for (const entry of database.History) {
    if (!entry.imagePath?.startsWith('/uploads/')) continue;
    const masterPhoto = moved.get(entry.imagePath);
    if (masterPhoto !== undefined) {
      entry.imagePath = masterPhoto;
    } else {
      entry.imagePath = migratePath(entry.imagePath, entry.type === 'withdraw' ? 'tarikan' : 'aktivitas');
    }
  }

  if (changed) await writeDatabase(database);
  // Hapus sumber lama hanya setelah referensi baru berhasil tersimpan di workbook.
  for (const oldPath of oldPaths) {
    const stillReferenced = database.Items.some(item => item.imagePath === oldPath) || database.History.some(entry => entry.imagePath === oldPath);
    if (!stillReferenced) deleteImageFile(oldPath);
  }
}

// Login awal dibuat otomatis saat file Excel belum memiliki akun.
async function initializeDatabase() {
  const database = await readDatabaseRaw();
  await migrateLegacyPhotoFolders(database);
  if (database.Users.length === 0) {
    database.Users.push({
      id: createId('USR'),
      username: 'admin',
      passwordHash: bcrypt.hashSync('admin', 12),
      role: 'admin',
      createdAt: new Date().toISOString()
    });
    await writeDatabase(database);
    console.log('Akun admin awal dibuat: username admin, password admin. Segera ganti password setelah login.');
  }
}

// Auth
app.post('/api/login', loginLimiter, asyncRoute(async (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string' || username.length > 30 || password.length > 100) {
    return res.status(400).json({ error: 'Username atau password tidak valid.' });
  }

  const database = await readDatabase();
  const user = database.Users.find(account => account.username.toLowerCase() === username.trim().toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Username atau password salah.' });
  }
  return createSession(req, res, user);
}));

app.get('/api/me', (req, res) => res.json({ user: req.session.user || null }));

app.post('/api/logout', requireAuth, (req, res) => {
  req.session.destroy(error => {
    if (error) return res.status(500).json({ error: 'Gagal keluar dari aplikasi.' });
    res.clearCookie(SESSION_NAME, { httpOnly: true, sameSite: 'strict', secure: false });
    return res.json({ ok: true });
  });
});

// Dashboard data
app.get('/api/data', requireAuth, asyncRoute(async (req, res) => {
  const database = await readDatabase();
  res.json({
    items: database.Items,
    alerts: database.Items.filter(item => Number(item.stock) <= 5).map(item => ({ type: 'low-stock', itemId: item.id, itemName: item.name, stock: Number(item.stock), threshold: 5 })),
    history: req.session.user.role === 'admin'
      ? database.History
      : database.History.filter(entry => ['out', 'withdraw'].includes(entry.type)),
    user: req.session.user
  });
}));

// Master barang: hanya admin yang boleh menambah, mengubah, atau menghapus.
app.post('/api/items', requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const { name, category = '', stock = 0, imageDataUrl = '' } = req.body || {};
  const quantity = Number(stock);
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 100 ||
      !Number.isInteger(quantity) || quantity < 0 || quantity > 100000000) {
    return res.status(400).json({ error: 'Nama barang atau stok awal tidak valid.' });
  }
  if (typeof category !== 'string' || category.length > 60) {
    return res.status(400).json({ error: 'Kategori maksimal 60 karakter.' });
  }

  let imagePath = '';
  try { imagePath = saveImageDataUrl(imageDataUrl, 'barang'); } catch (error) { return res.status(400).json({ error: error.message }); }
  let item;
  try {
    item = await updateDatabase(database => {
      const now = new Date().toISOString();
      const newItem = {
        id: createId('BRG'), name: name.trim(), category: category.trim(),
        stock: quantity, imagePath, createdAt: now, updatedAt: now
      };
      database.Items.push(newItem);
      addHistory(database, {
        type: 'added', itemId: newItem.id, itemName: newItem.name,
        quantity, before: 0, after: quantity,
        purpose: 'Penambahan data barang', note: 'Barang baru ditambahkan', imagePath
      }, req.session.user);
      return newItem;
    });
  } catch (error) {
    if (imagePath) deleteImageFile(imagePath);
    throw error;
  }
  return res.status(201).json({ item });
}));

app.put('/api/items/:id', requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const { name, category = '', stock, imageDataUrl, removeImage = false } = req.body || {};
  const quantity = Number(stock);
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 100 ||
      !Number.isInteger(quantity) || quantity < 0 || quantity > 100000000 ||
      typeof category !== 'string' || category.length > 60 || typeof removeImage !== 'boolean') {
    return res.status(400).json({ error: 'Data barang tidak valid.' });
  }

  let newImagePath = '';
  try { if (imageDataUrl) newImagePath = saveImageDataUrl(imageDataUrl, 'barang'); }
  catch (error) { return res.status(400).json({ error: error.message }); }

  let oldImagePath = '';
  try {
    const item = await updateDatabase(database => {
      const current = database.Items.find(entry => entry.id === req.params.id);
      if (!current) return null;
      oldImagePath = current.imagePath || '';
      const nextImagePath = newImagePath || (removeImage ? '' : oldImagePath);
      const before = Number(current.stock);
      if (before !== quantity) {
        addHistory(database, {
          type: 'adjustment', itemId: current.id, itemName: current.name,
          quantity: Math.abs(quantity - before), before, after: quantity,
          purpose: 'Penyesuaian stok oleh admin',
          note: 'Jumlah stok diubah melalui menu edit barang'
        }, req.session.user);
      }
      Object.assign(current, {
        name: name.trim(), category: category.trim(), stock: quantity,
        imagePath: nextImagePath, updatedAt: new Date().toISOString()
      });
      // Riwayat yang hanya menunjuk foto master lama diarahkan ke foto terbaru,
      // atau dikosongkan saat foto master dihapus. Foto tarikan tidak ikut berubah.
      if (oldImagePath && oldImagePath !== nextImagePath) {
        for (const entry of database.History) {
          if (entry.itemId === current.id && entry.imagePath === oldImagePath) entry.imagePath = nextImagePath;
        }
      }
      return { ...current };
    });
    if (!item) {
      if (newImagePath) deleteImageFile(newImagePath);
      return res.status(404).json({ error: 'Barang tidak ditemukan.' });
    }
    // File lama baru dihapus setelah workbook berhasil tersimpan.
    if (oldImagePath && oldImagePath !== item.imagePath) deleteImageFile(oldImagePath);
    return res.json({ item });
  } catch (error) {
    if (newImagePath) deleteImageFile(newImagePath);
    throw error;
  }
}));

// Endpoint khusus hapus foto master tanpa menghapus data barang.
app.delete('/api/items/:id/photo', requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  let oldImagePath = '';
  const item = await updateDatabase(database => {
    const current = database.Items.find(entry => entry.id === req.params.id);
    if (!current) return null;
    oldImagePath = current.imagePath || '';
    current.imagePath = '';
    current.updatedAt = new Date().toISOString();
    if (oldImagePath) {
      for (const entry of database.History) {
        if (entry.itemId === current.id && entry.imagePath === oldImagePath) entry.imagePath = '';
      }
    }
    return { ...current };
  });
  if (!item) return res.status(404).json({ error: 'Barang tidak ditemukan.' });
  if (oldImagePath) deleteImageFile(oldImagePath);
  return res.json({ item });
}));

app.delete('/api/items/:id', requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  let removedImagePath = '';
  const removed = await updateDatabase(database => {
    const index = database.Items.findIndex(entry => entry.id === req.params.id);
    if (index < 0) return false;
    const [item] = database.Items.splice(index, 1);
    if (item.imagePath) {
      for (const entry of database.History) if (entry.itemId === item.id && entry.imagePath === item.imagePath) entry.imagePath = '';
      removedImagePath = item.imagePath;
    }
    return true;
  });
  if (!removed) return res.status(404).json({ error: 'Barang tidak ditemukan.' });
  if (removedImagePath) deleteImageFile(removedImagePath);
  return res.json({ ok: true });
}));

// Transaksi barang masuk/keluar. Barang masuk hanya boleh dilakukan admin.
app.post('/api/transactions', requireAuth, asyncRoute(async (req, res) => {
  const { type, purpose = '', note = '' } = req.body || {};
  if (!['in', 'out'].includes(type)) return res.status(400).json({ error: 'Jenis aktivitas tidak valid.' });
  if (type === 'in' && req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Barang masuk hanya dapat dicatat oleh admin.' });
  }
  if (typeof purpose !== 'string' || purpose.length > 200 || typeof note !== 'string' || note.length > 500) {
    return res.status(400).json({ error: 'Keterangan aktivitas terlalu panjang atau tidak valid.' });
  }
  const lines = Array.isArray(req.body.items)
    ? req.body.items
    : [{ itemId: req.body.itemId, quantity: req.body.quantity }];
  if (!lines.length) return res.status(400).json({ error: 'Tambahkan minimal satu barang.' });
  const normalized = lines.map(line => ({ itemId: line?.itemId, quantity: Number(line?.quantity) }));
  if (normalized.some(line => typeof line.itemId !== 'string' || !line.itemId ||
      !Number.isSafeInteger(line.quantity) || line.quantity < 1)) {
    return res.status(400).json({ error: 'Barang atau jumlah pada salah satu baris tidak valid.' });
  }
  if (new Set(normalized.map(line => line.itemId)).size !== normalized.length) {
    return res.status(400).json({ error: 'Barang yang sama tidak boleh dimasukkan dua kali dalam satu aktivitas.' });
  }

  const result = await updateDatabase(database => {
    const prepared = [];
    for (const line of normalized) {
      const item = database.Items.find(entry => entry.id === line.itemId);
      if (!item) return { error: 'Salah satu barang tidak ditemukan.' };
      if (type === 'out' && line.quantity > Number(item.stock)) {
        return { error: `Stok ${item.name} tidak mencukupi (tersedia ${item.stock}).` };
      }
      prepared.push({ item, quantity: line.quantity });
    }
    for (const { item, quantity } of prepared) {
      const before = Number(item.stock);
      item.stock = before + (type === 'in' ? quantity : -quantity);
      item.updatedAt = new Date().toISOString();
      addHistory(database, {
        type, itemId: item.id, itemName: item.name,
        quantity, before, after: item.stock,
        purpose: purpose.trim(), note: note.trim(), imagePath: item.imagePath || ''
      }, req.session.user);
    }
    return { count: prepared.length };
  });
  if (result.error) return res.status(400).json({ error: result.error });
  return res.status(201).json({ ok: true, count: result.count });
}));

// Barang tarikan: pilihan berasal dari seluruh master barang.
// Jumlah penarikan dibatasi oleh total barang yang pernah keluar dikurangi total yang sudah ditarik.
app.post('/api/withdrawals', requireAuth, asyncRoute(async (req, res) => {
  const { reason } = req.body || {};
  const lines = Array.isArray(req.body.items) ? req.body.items : [];
  if (!lines.length || typeof reason !== 'string' || !reason.trim() || reason.trim().length > 500) {
    return res.status(400).json({ error: 'Tambahkan minimal satu barang dan isi alasan penarikan.' });
  }

  const normalized = [];
  try {
    for (const line of lines) {
      normalized.push({
        itemId: line?.itemId,
        quantity: Number(line?.quantity),
        imagePath: saveImageDataUrl(line?.imageDataUrl || '', 'tarikan')
      });
    }
  } catch (error) {
    for (const line of normalized) if (line.imagePath) deleteImageFile(line.imagePath);
    return res.status(400).json({ error: error.message });
  }
  if (normalized.some(line => typeof line.itemId !== 'string' || !line.itemId ||
      !Number.isSafeInteger(line.quantity) || line.quantity < 1)) {
    for (const line of normalized) if (line.imagePath) deleteImageFile(line.imagePath);
    return res.status(400).json({ error: 'Barang atau jumlah pada salah satu baris tidak valid.' });
  }
  if (new Set(normalized.map(line => line.itemId)).size !== normalized.length) {
    for (const line of normalized) if (line.imagePath) deleteImageFile(line.imagePath);
    return res.status(400).json({ error: 'Barang yang sama tidak boleh dimasukkan dua kali dalam satu pengajuan.' });
  }

  let result;
  try {
    result = await updateDatabase(database => {
      const prepared = [];
      for (const line of normalized) {
        const item = database.Items.find(entry => entry.id === line.itemId);
        if (!item) return { error: 'Salah satu barang tidak ditemukan di database.' };
        const totalOut = database.History
          .filter(entry => entry.type === 'out' && entry.itemId === item.id)
          .reduce((sum, entry) => sum + Number(entry.quantity || 0), 0);
        const totalWithdrawn = database.History
          .filter(entry => entry.type === 'withdraw' && entry.itemId === item.id)
          .reduce((sum, entry) => sum + Number(entry.quantity || 0), 0);
        const remaining = Math.max(0, totalOut - totalWithdrawn);
        if (line.quantity > remaining) {
          return { error: `Jumlah tarikan ${item.name} melebihi jumlah yang pernah dikeluarkan dan belum ditarik (${remaining}).` };
        }
        prepared.push({ item, quantity: line.quantity, imagePath: line.imagePath });
      }
      for (const { item, quantity, imagePath } of prepared) {
        const before = Number(item.stock);
        item.stock = before + quantity;
        item.updatedAt = new Date().toISOString();
        addHistory(database, {
          type: 'withdraw', itemId: item.id, itemName: item.name,
          quantity, before, after: item.stock,
          purpose: 'Barang tarikan teknisi', note: reason.trim(), relatedId: '',
          imagePath: imagePath || item.imagePath || ''
        }, req.session.user);
      }
      return { count: prepared.length };
    });
  } catch (error) {
    for (const line of normalized) if (line.imagePath) deleteImageFile(line.imagePath);
    throw error;
  }
  if (result.error) {
    for (const line of normalized) if (line.imagePath) deleteImageFile(line.imagePath);
    return res.status(400).json({ error: result.error });
  }
  return res.status(201).json({ ok: true, count: result.count });
}));

// Manajemen akun: endpoint seluruhnya dilindungi role admin.
app.get('/api/users', requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const database = await readDatabase();
  res.json({ users: database.Users.map(safeUser) });
}));

app.post('/api/users', requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const { username, password, confirmPassword, role = 'user' } = req.body || {};
  if (!isValidUsername(username)) {
    return res.status(400).json({ error: 'Username harus 3–30 karakter: huruf, angka, titik, _ atau -.' });
  }
  if (!isValidPassword(password, 10)) return res.status(400).json({ error: 'Password minimal 10 karakter.' });
  if (confirmPassword !== undefined && password !== confirmPassword) {
    return res.status(400).json({ error: 'Konfirmasi password tidak sama.' });
  }
  if (!['admin', 'user'].includes(role)) return res.status(400).json({ error: 'Role tidak valid.' });

  const result = await updateDatabase(database => {
    const cleanUsername = username.trim();
    if (database.Users.some(account => account.username.toLowerCase() === cleanUsername.toLowerCase())) {
      return { error: 'Username sudah digunakan.' };
    }
    const user = {
      id: createId('USR'),
      username: cleanUsername,
      passwordHash: bcrypt.hashSync(password, 12),
      role,
      createdAt: new Date().toISOString()
    };
    database.Users.push(user);
    return { user: safeUser(user) };
  });
  if (result.error) return res.status(409).json({ error: result.error });
  return res.status(201).json(result);
}));

app.delete('/api/users/:id', requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const result = await updateDatabase(database => {
    const user = database.Users.find(account => account.id === req.params.id);
    if (!user) return { error: 'Pengguna tidak ditemukan.', status: 404 };
    if (user.id === req.session.user.id) return { error: 'Tidak bisa menghapus akun yang sedang digunakan.', status: 400 };
    if (user.role === 'admin' && database.Users.filter(account => account.role === 'admin').length <= 1) {
      return { error: 'Minimal harus ada satu akun admin.', status: 400 };
    }
    database.Users = database.Users.filter(account => account.id !== user.id);
    return { ok: true };
  });
  if (result.error) return res.status(result.status).json({ error: result.error });
  return res.json({ ok: true });
}));

app.post('/api/change-password', requireAuth, asyncRoute(async (req, res) => {
  const { oldPassword, newPassword, confirmPassword } = req.body || {};
  if (!isValidPassword(newPassword, 10)) return res.status(400).json({ error: 'Password baru minimal 10 karakter.' });
  if (newPassword !== confirmPassword) return res.status(400).json({ error: 'Konfirmasi password baru tidak sama.' });

  const result = await updateDatabase(database => {
    const user = database.Users.find(account => account.id === req.session.user.id);
    if (!user || !bcrypt.compareSync(oldPassword || '', user.passwordHash)) return false;
    user.passwordHash = bcrypt.hashSync(newPassword, 12);
    return true;
  });
  if (!result) return res.status(400).json({ error: 'Password lama salah.' });
  return res.json({ ok: true });
}));

function reportEscape(value = '') {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function transactionLabel(type) {
  return ({ added: 'Penambahan barang', in: 'Barang masuk', out: 'Barang keluar', withdraw: 'Barang tarikan', adjustment: 'Penyesuaian' })[type] || type;
}

// Export laporan Excel: hanya data inventaris, tanpa kredensial/hash akun.
app.get('/api/export/excel', requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const database = await readDatabase();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Inventaris Lokal';
  workbook.created = new Date();

  const summary = workbook.addWorksheet('Ringkasan');
  const totalStock = database.Items.reduce((sum, item) => sum + Number(item.stock || 0), 0);
  const counts = { added: 0, in: 0, out: 0, withdraw: 0, adjustment: 0 };
  for (const entry of database.History) counts[entry.type] = (counts[entry.type] || 0) + 1;
  summary.addRows([
    ['REKAP INVENTARIS'],
    ['Tanggal export', new Date()],
    ['Total jenis barang', database.Items.length],
    ['Total stok tersedia', totalStock],
    ['Barang stok menipis (≤ 5)', database.Items.filter(item => Number(item.stock) <= 5).length],
    [],
    ['Jenis transaksi', 'Jumlah baris'],
    ['Barang ditambahkan', counts.added],
    ['Barang masuk', counts.in],
    ['Barang keluar', counts.out],
    ['Penarikan', counts.withdraw],
    ['Penyesuaian', counts.adjustment],
    ['Total riwayat', database.History.length]
  ]);
  summary.getColumn(1).width = 32;
  summary.getColumn(2).width = 24;
  summary.getRow(1).font = { bold: true, size: 16, color: { argb: 'FF20324D' } };
  summary.getRow(7).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  summary.getRow(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF20324D' } };
  summary.getCell('B2').numFmt = 'dd mmmm yyyy hh:mm';

  const itemsSheet = workbook.addWorksheet('Data Barang');
  itemsSheet.columns = [
    { header: 'ID Barang', key: 'id', width: 38 },
    { header: 'Nama Barang', key: 'name', width: 32 },
    { header: 'Kategori', key: 'category', width: 24 },
    { header: 'Stok', key: 'stock', width: 14 },
    { header: 'Foto', key: 'imagePath', width: 18 },
    { header: 'Dibuat', key: 'createdAt', width: 24 },
    { header: 'Terakhir Diubah', key: 'updatedAt', width: 24 }
  ];
  itemsSheet.addRows(database.Items);
  itemsSheet.getColumn(5).width = 18;
  for (let index = 0; index < database.Items.length; index += 1) {
    const item = database.Items[index];
    const filename = item.imagePath ? path.basename(item.imagePath) : '';
    const fullPath = resolveImageFile(item.imagePath);
    if (!fullPath || !fs.existsSync(fullPath)) continue;
    const ext = path.extname(fullPath).slice(1).toLowerCase();
    if (!['jpg', 'jpeg', 'png'].includes(ext)) continue;
    const imageId = workbook.addImage({ filename: fullPath, extension: ext === 'jpg' ? 'jpeg' : ext });
    const rowNumber = index + 2;
    itemsSheet.getRow(rowNumber).height = 54;
    itemsSheet.addImage(imageId, `E${rowNumber}:E${rowNumber}`);
  }

  const historySheet = workbook.addWorksheet('Histori Aktivitas');
  historySheet.columns = [
    { header: 'Tanggal', key: 'createdAt', width: 24 },
    { header: 'ID Transaksi', key: 'id', width: 38 },
    { header: 'Jenis', key: 'typeLabel', width: 20 },
    { header: 'ID Barang', key: 'itemId', width: 38 },
    { header: 'Nama Barang', key: 'itemName', width: 30 },
    { header: 'Jumlah', key: 'quantity', width: 12 },
    { header: 'Stok Sebelum', key: 'before', width: 16 },
    { header: 'Stok Sesudah', key: 'after', width: 16 },
    { header: 'Keperluan', key: 'purpose', width: 28 },
    { header: 'Catatan / Alasan', key: 'note', width: 42 },
    { header: 'Pengguna', key: 'createdBy', width: 22 },
    { header: 'ID Transaksi Asal', key: 'relatedId', width: 38 },
    { header: 'Foto', key: 'imagePath', width: 18 }
  ];
  const sortedForExcel = [...database.History].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  historySheet.addRows(sortedForExcel.map(entry => ({ ...entry, typeLabel: transactionLabel(entry.type) })));
  historySheet.getColumn(13).width = 18;
  for (let index = 0; index < sortedForExcel.length; index += 1) {
    const entry = sortedForExcel[index];
    const filename = entry.imagePath ? path.basename(entry.imagePath) : '';
    const fullPath = resolveImageFile(entry.imagePath);
    if (!fullPath || !fs.existsSync(fullPath)) continue;
    const ext = path.extname(fullPath).slice(1).toLowerCase();
    if (!['jpg', 'jpeg', 'png'].includes(ext)) continue;
    const imageId = workbook.addImage({ filename: fullPath, extension: ext === 'jpg' ? 'jpeg' : ext });
    const rowNumber = index + 2;
    historySheet.getRow(rowNumber).height = 54;
    historySheet.addImage(imageId, `M${rowNumber}:M${rowNumber}`);
  }

  for (const sheet of [itemsSheet, historySheet]) {
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, sheet.rowCount), column: sheet.columnCount } };
    const header = sheet.getRow(1);
    header.height = 22;
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF20324D' } };
    header.alignment = { vertical: 'middle', wrapText: true };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="rekap-inventaris-${new Date().toISOString().slice(0, 10)}.xlsx"`);
  return res.send(Buffer.from(buffer));
}));

// Rekap PDF langsung diunduh sebagai file PDF.
app.get('/api/export/pdf', requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const database = await readDatabase();
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 28, bufferPages: true, info: { Title: 'Rekap Inventaris Teknisi', Author: 'Inventaris Teknisi' } });
  const chunks = [];
  doc.on('data', chunk => chunks.push(chunk));
  const finished = new Promise((resolve, reject) => { doc.on('end', resolve); doc.on('error', reject); });
  const pageWidth = doc.page.width - 56;
  const lineColor = '#d8dee8';
  const headerColor = '#20324d';
  const addPageIfNeeded = (height) => { if (doc.y + height > doc.page.height - 35) { doc.addPage(); } };
  const title = (text) => { addPageIfNeeded(36); doc.fillColor(headerColor).font('Helvetica-Bold').fontSize(14).text(text); doc.moveDown(0.45); };
  const drawTable = (columns, rows) => {
    const headerHeight = 24;
    const rowHeight = 42;
    const drawHeader = () => {
      let x = 28; const y = doc.y;
      doc.fillColor(headerColor).rect(28, y, pageWidth, headerHeight).fill();
      columns.forEach(column => { doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7).text(column.label, x + 4, y + 7, { width: column.width - 8, height: 12, ellipsis: true }); x += column.width; });
      doc.y = y + headerHeight;
    };
    drawHeader();
    for (const row of rows) {
      addPageIfNeeded(rowHeight + 3);
      if (doc.y === 28) drawHeader();
      const y = doc.y; let x = 28;
      doc.fillColor('#ffffff').rect(28, y, pageWidth, rowHeight).fill();
      doc.strokeColor(lineColor).lineWidth(0.5).rect(28, y, pageWidth, rowHeight).stroke();
      columns.forEach(column => {
        const value = row[column.key];
        if (column.key === 'photo' && value) {
          const fullPath = resolveImageFile(value);
          if (fullPath && fs.existsSync(fullPath)) { try { doc.image(fullPath, x + 4, y + 4, { fit: [column.width - 8, rowHeight - 8] }); } catch { /* Foto rusak dilewati. */ } }
        } else {
          doc.fillColor('#273449').font('Helvetica').fontSize(7).text(String(value ?? '—'), x + 4, y + 5, { width: column.width - 8, height: rowHeight - 9, ellipsis: true });
        }
        x += column.width;
      });
      doc.y = y + rowHeight;
    }
    doc.moveDown(1);
  };

  doc.fillColor(headerColor).font('Helvetica-Bold').fontSize(21).text('REKAP INVENTARIS TEKNISI');
  doc.fillColor('#667085').font('Helvetica').fontSize(9).text(`Dicetak: ${new Date().toLocaleString('id-ID')}`);
  doc.moveDown(1);
  const totalStock = database.Items.reduce((sum, item) => sum + Number(item.stock || 0), 0);
  const stats = [ ['Jenis Barang', database.Items.length], ['Total Stok', totalStock], ['Stok Menipis', database.Items.filter(item => Number(item.stock) <= 5).length], ['Histori Aktivitas', database.History.length] ];
  const statWidth = pageWidth / stats.length;
  stats.forEach((stat, index) => { const x = 28 + index * statWidth; doc.roundedRect(x + 3, doc.y, statWidth - 8, 42, 5).stroke(lineColor); doc.fillColor('#667085').font('Helvetica').fontSize(8).text(stat[0], x + 10, doc.y + 7); doc.fillColor(headerColor).font('Helvetica-Bold').fontSize(14).text(String(stat[1]), x + 10, doc.y + 20); });
  doc.y += 54;

  title('DATA BARANG');
  drawTable([
    { key: 'photo', label: 'FOTO', width: 52 }, { key: 'id', label: 'KODE BARANG', width: 145 },
    { key: 'name', label: 'NAMA BARANG', width: 205 }, { key: 'category', label: 'KATEGORI', width: 145 },
    { key: 'stock', label: 'STOK', width: 55 }, { key: 'createdBy', label: 'DITAMBAHKAN', width: 152 }
  ], database.Items.map(item => ({ photo: item.imagePath, id: item.id, name: item.name, category: item.category || '—', stock: item.stock, createdBy: new Date(item.createdAt).toLocaleDateString('id-ID') })));

  title('HISTORI AKTIVITAS TEKNISI');
  const historyRows = [...database.History].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).map(entry => ({
    date: new Date(entry.createdAt).toLocaleString('id-ID'), photo: entry.imagePath,
    name: entry.itemName, type: transactionLabel(entry.type), quantity: entry.quantity,
    after: entry.after, note: entry.note || entry.purpose || '—', user: entry.createdBy || '—'
  }));
  drawTable([
    { key: 'date', label: 'TANGGAL', width: 100 }, { key: 'photo', label: 'FOTO', width: 48 },
    { key: 'name', label: 'BARANG', width: 125 }, { key: 'type', label: 'JENIS AKTIVITAS', width: 95 },
    { key: 'quantity', label: 'JUMLAH', width: 48 }, { key: 'after', label: 'STOK AKHIR', width: 55 },
    { key: 'note', label: 'KETERANGAN / ALASAN', width: 170 }, { key: 'user', label: 'TEKNISI / PENCATAT', width: 145 }
  ], historyRows);
  doc.end();
  await finished;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="rekap-inventaris-teknisi-${new Date().toISOString().slice(0, 10)}.pdf"`);
  return res.send(Buffer.concat(chunks));
}));

app.get('/api/backup', requireAuth, requireAdmin, (req, res) => {
  if (!fs.existsSync(DB_FILE)) return res.status(404).json({ error: 'File database belum tersedia.' });
  return res.download(DB_FILE, `backup-inventaris-${new Date().toISOString().slice(0, 10)}.xlsx`);
});

app.use('/uploads', express.static(UPLOAD_DIR, { dotfiles: 'deny', index: false, maxAge: '7d', immutable: true }));
app.use('/foto/barang', express.static(PHOTO_DIRS.barang, { dotfiles: 'deny', index: false, maxAge: '7d', immutable: true }));
app.use('/foto/tarikan', express.static(PHOTO_DIRS.tarikan, { dotfiles: 'deny', index: false, maxAge: '7d', immutable: true }));
app.use('/foto/aktivitas', express.static(PHOTO_DIRS.aktivitas, { dotfiles: 'deny', index: false, maxAge: '7d', immutable: true }));
app.use(express.static(path.join(__dirname, 'public'), { etag: true, maxAge: 0 }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.use((error, req, res, next) => {
  console.error(`[${new Date().toISOString()}]`, error);
  if (res.headersSent) return next(error);
  return res.status(500).json({ error: 'Terjadi kesalahan pada server. Periksa terminal untuk detail.' });
});

initializeDatabase()
  .then(() => {
    app.listen(PORT, HOST, () => {
      console.log('');
      console.log('==============================================');
      console.log('  INVENTARIS LOKAL BERHASIL DIJALANKAN');
      console.log(`  Website : http://localhost:${PORT}`);
      console.log(`  Database: ${DB_FILE}`);
      console.log('  Login awal: admin / admin');
      console.log('  Segera ganti password setelah login.');
      console.log('==============================================');
      console.log('');
    });
  })
  .catch(error => {
    console.error('Aplikasi gagal memulai database:', error);
    process.exit(1);
  });
