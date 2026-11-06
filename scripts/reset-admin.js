'use strict';

// Reset only the admin login. Existing Items and Riwayat sheets are preserved.
const ExcelJS = require('exceljs');
const bcrypt = require('bcryptjs');
const fs = require('node:fs');
const path = require('node:path');

const dataDirectory = path.join(__dirname, '..', 'data');
const databaseFile = path.join(dataDirectory, 'inventaris.xlsx');
const temporaryFile = path.join(dataDirectory, `inventaris-reset-${process.pid}.tmp.xlsx`);

async function resetAdmin() {
  fs.mkdirSync(dataDirectory, { recursive: true });

  const workbook = new ExcelJS.Workbook();
  if (fs.existsSync(databaseFile)) {
    await workbook.xlsx.readFile(databaseFile);
  }

  let usersSheet = workbook.getWorksheet('Users');
  if (!usersSheet) usersSheet = workbook.addWorksheet('Users');

  const headers = ['id', 'username', 'passwordHash', 'role', 'createdAt'];
  if (usersSheet.rowCount === 0) {
    usersSheet.addRow(headers);
  }

  const columns = new Map();
  usersSheet.getRow(1).eachCell((cell, columnNumber) => {
    columns.set(String(cell.value || '').trim(), columnNumber);
  });

  for (const header of headers) {
    if (!columns.has(header)) {
      const columnNumber = usersSheet.columnCount + 1;
      usersSheet.getCell(1, columnNumber).value = header;
      columns.set(header, columnNumber);
    }
  }

  const usernameColumn = columns.get('username');
  const adminRow = [];
  for (let rowNumber = 2; rowNumber <= usersSheet.rowCount; rowNumber += 1) {
    const username = String(usersSheet.getCell(rowNumber, usernameColumn).value || '').trim().toLowerCase();
    if (username === 'admin') {
      adminRow.push(rowNumber);
    }
  }

  const passwordHash = bcrypt.hashSync('admin', 12);
  if (adminRow.length) {
    const row = usersSheet.getRow(adminRow[0]);
    row.getCell(columns.get('passwordHash')).value = passwordHash;
    row.getCell(columns.get('role')).value = 'admin';
    for (const duplicateRow of adminRow.slice(1).reverse()) usersSheet.spliceRows(duplicateRow, 1);
  } else {
    const values = [];
    values[columns.get('id')] = `USR-${Date.now()}`;
    values[usernameColumn] = 'admin';
    values[columns.get('passwordHash')] = passwordHash;
    values[columns.get('role')] = 'admin';
    values[columns.get('createdAt')] = new Date().toISOString();
    usersSheet.addRow(values);
  }

  await workbook.xlsx.writeFile(temporaryFile);
  fs.renameSync(temporaryFile, databaseFile);
  try { fs.chmodSync(databaseFile, 0o600); } catch { /* Windows may not support POSIX modes. */ }

  console.log('Login admin berhasil direset. Username: admin | Password: admin');
  console.log('Data barang dan histori transaksi tetap dipertahankan. Segera ganti password setelah login.');
}

resetAdmin().catch((error) => {
  console.error('Gagal mereset akun admin:', error);
  try { fs.unlinkSync(temporaryFile); } catch { /* No temporary file to remove. */ }
  process.exitCode = 1;
});
