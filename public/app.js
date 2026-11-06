'use strict';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const state = { user: null, items: [], history: [], alerts: [], alertsInitialized: false, historyFilter: 'all' };

async function api(endpoint, options = {}) {
  const response = await fetch(`/api${endpoint}`, {
    credentials: 'same-origin',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Permintaan gagal.');
  return data;
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function compressImage(file, maxSide = 900, quality = 0.62) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve('');
    if (!file.type.startsWith('image/')) return reject(new Error('File harus berupa gambar.'));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Foto gagal dibaca.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Foto tidak bisa dibuka.'));
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function photoCell(path, alt = 'Foto barang') {
  return path ? `<img class="table-photo" src="${escapeHtml(path)}" alt="${escapeHtml(alt)}" loading="lazy">` : '<span class="photo-empty">—</span>';
}

function formatDate(value, withTime = true) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('id-ID', withTime
    ? { dateStyle: 'medium', timeStyle: 'short' }
    : { dateStyle: 'medium' });
}

function toast(message, isError = false) {
  const element = $('#toast');
  element.textContent = message;
  element.className = `toast show${isError ? ' bad' : ''}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { element.className = 'toast'; }, 3200);
}

async function boot() {
  try {
    const { user } = await api('/me');
    if (user) enterApplication(user);
  } catch (error) {
    $('#loginError').textContent = error.message;
  }
}

function enterApplication(user) {
  state.user = user;
  $('#login').classList.add('hidden');
  $('#app').classList.remove('hidden');
  $('#who').textContent = `${user.username} · ${user.role === 'admin' ? 'Admin' : 'User'}`;
  document.body.classList.toggle('is-admin', user.role === 'admin');
  $$('.admin-only').forEach((element) => {
    element.classList.toggle('hidden', user.role !== 'admin');
  });
  refreshData().catch((error) => toast(error.message, true));
}

async function refreshData() {
  const data = await api('/data');
  state.items = Array.isArray(data.items) ? data.items : [];
  state.history = Array.isArray(data.history) ? data.history : [];
  const nextAlerts = Array.isArray(data.alerts) ? data.alerts : [];
  const newlyLow = nextAlerts.filter(alert => !state.alerts.some(old => old.itemId === alert.itemId));
  state.alerts = nextAlerts;
  if (state.alertsInitialized && state.user.role === 'admin' && newlyLow.length) {
    toast(`Peringatan untuk pengurus: ${newlyLow.map(alert => alert.itemName).join(', ')} stoknya menipis.`);
  }
  state.alertsInitialized = true;
  renderDashboard();
  renderStockAlerts();
  renderItems();
  renderTransactions();
  renderHistory();
  if (state.user.role === 'admin') await loadUsers();
}

function renderDashboard() {
  const { items, history } = state;
  const today = new Date().toLocaleDateString('en-CA');
  $('#sTypes').textContent = items.length;
  $('#sStock').textContent = items.reduce((sum, item) => sum + Number(item.stock || 0), 0);
  $('#sLow').textContent = items.filter((item) => Number(item.stock) <= 5).length;
  $('#sToday').textContent = history.filter((entry) => (
    new Date(entry.createdAt).toLocaleDateString('en-CA') === today
  )).length;

  const recent = [...history]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 7);
  $('#recent').innerHTML = recent.map((entry) => `
    <tr>
      <td>${formatDate(entry.createdAt)}</td>
      <td><b>${escapeHtml(entry.itemName)}</b></td>
      <td>${typeBadge(entry.type)}</td>
      <td>${Number(entry.quantity)}</td>
      <td>${escapeHtml(entry.purpose || entry.note || '—')}</td>
    </tr>
  `).join('') || emptyRow(5);
}

function renderStockAlerts() {
  const panel = $('#stockAlertsPanel');
  if (!panel) return;
  const alerts = state.alerts;
  $('#alertCount').textContent = String(alerts.length);
  $('#stockAlerts').innerHTML = alerts.length ? alerts.map(alert => `
    <div class="stock-alert-row">
      <div><b>${escapeHtml(alert.itemName)}</b><small>Kode: ${escapeHtml(alert.itemId)}</small></div>
      <span class="stock-alert-value">Sisa ${Number(alert.stock)} unit</span>
    </div>
  `).join('') : '<p class="muted alert-clear">Semua stok berada di atas batas peringatan.</p>';
}

function renderItems() {
  const query = ($('#search')?.value || '').trim().toLowerCase();
  const filtered = state.items.filter((item) => (
    `${item.name} ${item.category || ''}`.toLowerCase().includes(query)
  ));

  $('#itemsTable').innerHTML = filtered.map((item) => {
    const actions = state.user.role === 'admin'
      ? `<button class="text" data-edit="${escapeHtml(item.id)}">Edit</button>
         <button class="danger" data-delete="${escapeHtml(item.id)}">Hapus</button>`
      : '<span class="muted">Hanya lihat</span>';
    return `
      <tr>
        <td>${photoCell(item.imagePath, item.name)}</td>
        <td><b>${escapeHtml(item.name)}</b><br><small>${escapeHtml(item.id)}</small></td>
        <td>${escapeHtml(item.category || '—')}</td>
        <td><b>${Number(item.stock)}</b></td>
        <td>${formatDate(item.createdAt, false)}</td>
        <td>${actions}</td>
      </tr>
    `;
  }).join('') || emptyRow(6);
}

function renderTransactions() {
  const itemOptions = '<option value="">Pilih barang</option>' + state.items.map((item) => `
    <option value="${escapeHtml(item.id)}">${escapeHtml(item.name)} — stok ${Number(item.stock)}</option>
  `).join('');
  $$('.item-select').forEach((select) => {
    const selected = select.value;
    select.innerHTML = itemOptions;
    select.value = selected;
  });

  // Daftar tarikan menampilkan SEMUA barang dari master database, bukan hanya histori keluar.
  const returnableByItem = new Map();
  state.items.forEach(item => {
    const totalOut = state.history
      .filter(entry => entry.type === 'out' && entry.itemId === item.id)
      .reduce((sum, entry) => sum + Number(entry.quantity || 0), 0);
    const totalWithdrawn = state.history
      .filter(entry => entry.type === 'withdraw' && entry.itemId === item.id)
      .reduce((sum, entry) => sum + Number(entry.quantity || 0), 0);
    returnableByItem.set(item.id, Math.max(0, totalOut - totalWithdrawn));
  });
  const historyOptions = '<option value="">Pilih barang dari database</option>' + state.items.map(item => `
    <option value="${escapeHtml(item.id)}">${escapeHtml(item.name)} · stok ${Number(item.stock)} · dapat ditarik ${returnableByItem.get(item.id) || 0}</option>
  `).join('');
  $$('.withdraw-item-select').forEach((select) => {
    const selected = select.value;
    select.innerHTML = historyOptions;
    select.value = selected;
    const row = select.closest('.multi-line');
    const item = state.items.find(entry => entry.id === select.value);
    const image = row?.querySelector('.line-photo');
    if (image) { image.src = item?.imagePath || ''; image.classList.toggle('hidden', !item?.imagePath); }
  });
  $$('#outLines .item-select').forEach(select => {
    const row = select.closest('.multi-line');
    const item = state.items.find(entry => entry.id === select.value);
    const image = row?.querySelector('.line-photo');
    const quantity = row?.querySelector('[name="quantity"]');
    if (image) { image.src = item?.imagePath || ''; image.classList.toggle('hidden', !item?.imagePath); }
    if (quantity) { if (item) quantity.max = String(Number(item.stock)); else quantity.removeAttribute('max'); }
  });
  $$('#withdrawLines .withdraw-item-select').forEach(select => {
    const row = select.closest('.multi-line');
    const quantity = row?.querySelector('[name="quantity"]');
    const available = returnableByItem.get(select.value);
    if (quantity) { if (select.value) quantity.max = String(available || 0); else quantity.removeAttribute('max'); }
  });
}

function addOutLine() {
  const row = document.createElement('div');
  row.className = 'multi-line';
  row.innerHTML = `<label>Barang<select class="item-select" name="itemId" required></select><img class="line-photo" alt="Foto barang"></label>
    <label>Jumlah<input name="quantity" type="number" min="1" step="1" required></label>
    <button class="danger line-remove" type="button" aria-label="Hapus baris">Hapus</button>`;
  $('#outLines').append(row);
  renderTransactions();
}

function addWithdrawLine() {
  const row = document.createElement('div');
  row.className = 'multi-line';
  row.innerHTML = `<label>Barang yang ditarik<select class="withdraw-item-select" name="itemId" required></select><img class="line-photo" alt="Foto barang yang ditarik"></label>
    <label>Jumlah ditarik<input name="quantity" type="number" min="1" step="1" required></label>
    <label>Foto kondisi barang<input class="withdraw-photo" type="file" accept="image/*"><small>Opsional, otomatis dikompres.</small><img class="withdraw-preview hidden" alt="Pratinjau foto tarikan"></label>
    <button class="danger line-remove" type="button" aria-label="Hapus baris">Hapus</button>`;
  $('#withdrawLines').append(row);
  renderTransactions();
}

function renderHistory() {
  const sorted = [...state.history].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const visible = sorted.filter(entry => {
    if (state.user.role !== 'admin' && entry.type === 'added') return false;
    return state.historyFilter === 'all' || entry.type === state.historyFilter;
  });
  $('#historyTable').innerHTML = visible.map((entry) => `
    <tr>
      <td>${photoCell(entry.imagePath, entry.itemName)}</td>
      <td>${formatDate(entry.createdAt)}</td>
      <td><b>${escapeHtml(entry.itemName)}</b></td>
      <td>${typeBadge(entry.type)}</td>
      <td>${Number(entry.quantity)}</td>
      <td>${Number(entry.after)}</td>
      <td>${escapeHtml(entry.note || entry.purpose || '—')}</td>
      <td><b>${escapeHtml(entry.createdBy || '—')}</b></td>
    </tr>
  `).join('') || emptyRow(8);
  $$('[data-history-filter]').forEach(button => button.classList.toggle('active', button.dataset.historyFilter === state.historyFilter));
}

function typeBadge(type) {
  const labels = {
    added: 'Barang ditambahkan', in: 'Barang masuk', out: 'Barang keluar', withdraw: 'Barang tarikan', adjustment: 'Penyesuaian'
  };
  return `<span class="pill ${escapeHtml(type)}">${labels[type] || escapeHtml(type)}</span>`;
}

function emptyRow(columns) {
  return `<tr><td colspan="${columns}" class="empty-cell">Belum ada data.</td></tr>`;
}

function showPage(pageId) {
  const titles = {
    dashboard: 'Dashboard', items: 'Data Barang', transactions: 'Aktivitas Barang',
    withdraw: 'Barang Tarikan', history: 'Histori Aktivitas',
    users: 'Manajemen Pengguna', settings: 'Pengaturan'
  };
  if (pageId === 'users' && state.user.role !== 'admin') {
    toast('Menu ini hanya dapat dibuka oleh admin.', true);
    return;
  }
  $$('.page').forEach((page) => page.classList.toggle('hidden', page.id !== pageId));
  $$('.nav').forEach((button) => button.classList.toggle('active', button.dataset.page === pageId));
  $('#heading').textContent = titles[pageId] || 'Inventaris';
}

async function loadUsers() {
  const { users } = await api('/users');
  $('#userList').innerHTML = users.map((user) => `
    <div class="user-row">
      <div>
        <b>${escapeHtml(user.username)}</b>
        <small>${user.role === 'admin' ? 'Administrator' : 'User biasa'}</small>
      </div>
      ${user.id === state.user.id
        ? '<span class="status">Akun aktif</span>'
        : `<button class="danger" data-user-delete="${escapeHtml(user.id)}">Hapus</button>`}
    </div>
  `).join('') || '<p class="muted">Belum ada akun.</p>';
}

// Login dan logout
$('#loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  $('#loginError').textContent = '';
  const form = event.currentTarget;
  const credentials = Object.fromEntries(new FormData(form));
  try {
    const { user } = await api('/login', {
      method: 'POST', body: JSON.stringify(credentials)
    });
    form.reset();
    enterApplication(user);
  } catch (error) {
    $('#loginError').textContent = error.message;
  }
});

$('#logout').addEventListener('click', async () => {
  try {
    await api('/logout', { method: 'POST' });
    window.location.reload();
  } catch (error) {
    toast(error.message, true);
  }
});

// Navigasi
$$('[data-page]').forEach((button) => {
  button.addEventListener('click', () => showPage(button.dataset.page));
});

// Dialog tambah/edit barang
function openItemDialog(item = null) {
  const form = $('#itemForm');
  form.reset();
  form.elements.id.value = item?.id || '';
  form.elements.name.value = item?.name || '';
  form.elements.category.value = item?.category || '';
  form.elements.stock.value = item ? item.stock : 0;
  $('#itemPhotoPreview').src = item?.imagePath || '';
  $('#itemPhotoPreview').classList.toggle('hidden', !item?.imagePath);
  $('#removeItemPhoto').classList.toggle('hidden', !item?.imagePath);
  $('#itemTitle').textContent = item ? 'Edit barang' : 'Tambah barang';
  $('#itemDialog').showModal();
}

$$('[data-open="itemDialog"]').forEach((button) => {
  button.addEventListener('click', () => {
    if (state.user.role === 'admin') openItemDialog();
  });
});
$$('[data-close]').forEach((button) => {
  button.addEventListener('click', () => $('#itemDialog').close());
});

$('#itemForm').elements.photo.addEventListener('change', async (event) => {
  const preview = $('#itemPhotoPreview');
  const file = event.target.files[0];
  if (!file) {
    const current = state.items.find(item => item.id === $('#itemForm').elements.id.value);
    preview.src = current?.imagePath || '';
    preview.classList.toggle('hidden', !current?.imagePath);
    $('#removeItemPhoto').classList.toggle('hidden', !current?.imagePath);
    return;
  }
  $('#removeItemPhoto').classList.add('hidden');
  try { preview.src = await compressImage(file, 700, 0.6); preview.classList.remove('hidden'); }
  catch (error) { toast(error.message, true); }
});

$('#removeItemPhoto').addEventListener('click', async () => {
  const itemId = $('#itemForm').elements.id.value;
  if (!itemId) return toast('Foto belum tersimpan. Simpan barang terlebih dahulu.', true);
  if (!confirm('Hapus foto barang ini secara permanen? Data barang tidak akan dihapus.')) return;
  try {
    await api(`/items/${encodeURIComponent(itemId)}/photo`, { method: 'DELETE' });
    $('#itemPhotoPreview').removeAttribute('src');
    $('#itemPhotoPreview').classList.add('hidden');
    $('#removeItemPhoto').classList.add('hidden');
    toast('Foto lama berhasil dihapus dari penyimpanan.');
    await refreshData();
  } catch (error) { toast(error.message, true); }
});

$('#itemForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (state.user.role !== 'admin') return;
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  const photo = form.elements.photo.files[0];
  delete values.photo;
  const itemId = values.id;
  delete values.id;
  try {
    if (photo) values.imageDataUrl = await compressImage(photo, 1000, 0.65);
    await api(`/items${itemId ? `/${encodeURIComponent(itemId)}` : ''}`, {
      method: itemId ? 'PUT' : 'POST', body: JSON.stringify(values)
    });
    $('#itemDialog').close();
    toast('Data barang berhasil disimpan.');
    await refreshData();
  } catch (error) {
    toast(error.message, true);
  }
});

$('#itemsTable').addEventListener('click', async (event) => {
  if (state.user.role !== 'admin') return;
  const editId = event.target.dataset.edit;
  const deleteId = event.target.dataset.delete;
  if (editId) {
    const item = state.items.find((row) => row.id === editId);
    if (item) openItemDialog(item);
  }
  if (deleteId && confirm('Hapus barang ini? Histori aktivitas tetap disimpan.')) {
    try {
      await api(`/items/${encodeURIComponent(deleteId)}`, { method: 'DELETE' });
      toast('Barang berhasil dihapus.');
      await refreshData();
    } catch (error) {
      toast(error.message, true);
    }
  }
});
$('#search').addEventListener('input', renderItems);

$('#outLines').addEventListener('change', (event) => { if (event.target.matches('.item-select')) renderTransactions(); });
$('#withdrawLines').addEventListener('change', async (event) => {
  if (event.target.matches('.withdraw-item-select')) renderTransactions();
  if (event.target.matches('.withdraw-photo')) {
    const preview = event.target.closest('.multi-line').querySelector('.withdraw-preview');
    try {
      const compressed = await compressImage(event.target.files[0], 700, 0.58);
      preview.src = compressed || '';
      preview.classList.toggle('hidden', !compressed);
    } catch (error) { toast(error.message, true); }
  }
});
$('#addOutLine').addEventListener('click', addOutLine);
$('#addWithdrawLine').addEventListener('click', addWithdrawLine);
$('#outLines').addEventListener('click', (event) => {
  if (event.target.classList.contains('line-remove')) {
    event.target.closest('.multi-line').remove();
    if (!$('#outLines').children.length) addOutLine();
  }
});
$('#withdrawLines').addEventListener('click', (event) => {
  if (event.target.classList.contains('line-remove')) {
    event.target.closest('.multi-line').remove();
    if (!$('#withdrawLines').children.length) addWithdrawLine();
  }
});
addOutLine();
addWithdrawLine();

// Barang masuk hanya admin; barang keluar dapat dilakukan semua pengguna.
$('#inForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (state.user.role !== 'admin') return toast('Barang masuk hanya dapat dilakukan admin.', true);
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  try {
    await api('/transactions', {
      method: 'POST', body: JSON.stringify({ type: 'in', items: [{ itemId: values.itemId, quantity: values.quantity }], purpose: values.purpose, note: values.note })
    });
    form.reset();
    toast('Barang masuk berhasil dicatat.');
    await refreshData();
  } catch (error) { toast(error.message, true); }
});

$('#outForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const rows = [...$('#outLines').querySelectorAll('.multi-line')];
  const items = rows.map(row => ({ itemId: row.querySelector('[name="itemId"]').value, quantity: row.querySelector('[name="quantity"]').value }));
  const purpose = form.elements.purpose.value;
  const note = form.elements.note.value;
  try {
    await api('/transactions', { method: 'POST', body: JSON.stringify({ type: 'out', items, purpose, note }) });
    form.reset();
    $('#outLines').innerHTML = '';
    addOutLine();
    toast(`Barang keluar berhasil dicatat (${items.length} jenis).`);
    await refreshData();
  } catch (error) { toast(error.message, true); }
});

// Catat barang tarikan dengan pilihan seluruh barang dari database master.
$('#withdrawForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const rows = [...$('#withdrawLines').querySelectorAll('.multi-line')];
  const reason = form.elements.reason.value;
  try {
    const items = await Promise.all(rows.map(async row => ({
      itemId: row.querySelector('[name="itemId"]').value,
      quantity: row.querySelector('[name="quantity"]').value,
      imageDataUrl: await compressImage(row.querySelector('.withdraw-photo').files[0], 850, 0.58)
    })));
    await api('/withdrawals', { method: 'POST', body: JSON.stringify({ items, reason }) });
    form.reset();
    $('#withdrawLines').innerHTML = '';
    addWithdrawLine();
    toast(`Penarikan berhasil (${items.length} jenis). Stok sudah dikembalikan.`);
    await refreshData();
  } catch (error) { toast(error.message, true); }
});

$$('[data-history-filter]').forEach(button => button.addEventListener('click', () => { state.historyFilter = button.dataset.historyFilter; renderHistory(); }));

// Hanya admin yang dapat membuat atau menghapus akun
$('#userForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (state.user.role !== 'admin') return;
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  try {
    await api('/users', { method: 'POST', body: JSON.stringify(values) });
    form.reset();
    toast('Akun berhasil dibuat.');
    await loadUsers();
  } catch (error) {
    toast(error.message, true);
  }
});

$('#userList').addEventListener('click', async (event) => {
  if (state.user.role !== 'admin') return;
  const userId = event.target.dataset.userDelete;
  if (!userId || !confirm('Hapus akun pengguna ini?')) return;
  try {
    await api(`/users/${encodeURIComponent(userId)}`, { method: 'DELETE' });
    toast('Akun berhasil dihapus.');
    await loadUsers();
  } catch (error) {
    toast(error.message, true);
  }
});

// Setiap pengguna dapat mengganti password miliknya sendiri
$('#passwordForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  try {
    await api('/change-password', { method: 'POST', body: JSON.stringify(values) });
    form.reset();
    toast('Password berhasil diperbarui.');
  } catch (error) {
    toast(error.message, true);
  }
});

window.addEventListener('error', (event) => {
  console.error('Kesalahan aplikasi:', event.error || event.message);
  toast('Ada masalah pada tampilan aplikasi. Muat ulang halaman atau periksa terminal.', true);
});
window.addEventListener('unhandledrejection', (event) => {
  console.error('Proses aplikasi gagal:', event.reason);
  toast(event.reason?.message || 'Ada proses yang gagal. Periksa koneksi dan terminal aplikasi.', true);
});

window.setInterval(() => {
  if (state.user && !document.hidden) refreshData().catch(error => toast(error.message, true));
}, 60000);

boot();
