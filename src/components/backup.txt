"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  Boxes,
  ArrowDownToLine,
  ArrowUpFromLine,
  RotateCcw,
  History,
  Users,
  Settings,
  LogOut,
  Search,
  Plus,
  Package,
  AlertTriangle,
  Activity,
  Trash2,
  Pencil,
  Download,
  Menu,
  X,
  CheckCircle2,
  AlertCircle,
  Save,
} from "lucide-react";
type Item = {
  id: string;
  name: string;
  category: string;
  stock: number;
  imagePath: string;
};
type User = { id: string; username: string; role: string };
type Hist = {
  id: string;
  createdAt: string;
  type: string;
  itemName: string;
  quantity: number;
  before: number;
  after: number;
  purpose: string;
  note: string;
  createdBy: string;
};
const nav = [
  ["/dashboard", "Dashboard", LayoutDashboard],
  ["/inventaris", "Inventaris", Boxes],
  ["/barang-masuk", "Barang Masuk", ArrowDownToLine],
  ["/barang-keluar", "Barang Keluar", ArrowUpFromLine],
  ["/barang-tarikan", "Barang Tarikan", RotateCcw],
  ["/histori", "Riwayat Aktivitas", History],
  ["/pengguna", "Pengguna", Users],
  ["/pengaturan", "Pengaturan", Settings],
] as const;
export default function Workspace({ user }: { user: User }) {
  const path = usePathname();
  const [items, setItems] = useState<Item[]>([]),
    [hist, setHist] = useState<Hist[]>([]),
    [users, setUsers] = useState<User[]>([]),
    [search, setSearch] = useState(""),
    [notice, setNotice] = useState(""),
    [noticeError, setNoticeError] = useState(false),
    [mobile, setMobile] = useState(false),
    [busy, setBusy] = useState(false);

  // State dialog edit barang
  const [editingItem, setEditingItem] = useState<Item | null>(null);

  const [editFields, setEditFields] = useState({
    name: "",
    category: "",
    stock: "0",
  });

  // State konfirmasi penghapusan
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => Promise<unknown>;
  } | null>(null);
  const [form, setForm] = useState({
    name: "",
    category: "",
    stock: "0",
    itemId: "",
    quantity: "1",
    purpose: "",
    note: "",
    reason: "",
    username: "",
    password: "",
    role: "user",
    oldPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  async function api(url: string, method = "GET", body?: unknown) {
    const r = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const d = await r.json();
    if (!r.ok) throw Error(d.error || "Permintaan gagal");
    return d;
  }
  const refresh = useCallback(async () => {
    const d = await api("/api/data");
    setItems(d.items);
    setHist(d.history);
    if (user.role === "admin") {
      const a = await api("/api/users");
      setUsers(a.users);
    }
  }, [user.role]);
  useEffect(() => {
    refresh().catch((e) => {
      setNoticeError(true);
      setNotice(e instanceof Error ? e.message : "Gagal memuat data.");
    });
  }, [refresh]);
  const filtered = useMemo(
    () =>
      items.filter((x) =>
        (x.name + " " + x.category)
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [items, search],
  );
  const title = nav.find((x) => x[0] === path)?.[1] || "Dashboard";
  function set(k: string, v: string) {
    setForm((p) => ({ ...p, [k]: v }));
  }
  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setNotice("");
    setNoticeError(false);
    try {
      await fn();
      await refresh();
      setNoticeError(false);
      setNotice("Perubahan berhasil disimpan.");
      setForm({
        name: "",
        category: "",
        stock: "0",
        itemId: "",
        quantity: "1",
        purpose: "",
        note: "",
        reason: "",
        username: "",
        password: "",
        role: "user",
        oldPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
    } catch (e) {
      setNoticeError(true);
      setNotice(e instanceof Error ? e.message : "Terjadi kesalahan");
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    await api("/api/logout", "POST", {});
    location.href = "/login";
  }
  const stats = [
    { label: "Jenis Barang", value: items.length, icon: Boxes, color: "blue" },
    {
      label: "Total Stok",
      value: items.reduce((s, x) => s + x.stock, 0).toLocaleString("id-ID"),
      icon: Package,
      color: "violet",
    },
    {
      label: "Stok Menipis",
      value: items.filter((x) => x.stock <= 5).length,
      icon: AlertTriangle,
      color: "amber",
    },
    {
      label: "Aktivitas Tercatat",
      value: hist.length,
      icon: Activity,
      color: "green",
    },
  ];
  const low = items.filter((x) => x.stock <= 5);
  return (
    <div className="min-h-screen">
      <aside
        className={`sidebar fixed inset-y-0 left-0 z-30 w-[260px] p-5 flex flex-col transition-transform lg:translate-x-0 ${mobile ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex items-center gap-3 px-2 py-3 mb-8">
          <div className="bg-blue-600 p-2.5 rounded-xl">
            <Boxes size={22} />
          </div>
          <div>
            <div className="font-display font-extrabold tracking-wide">
              TEKNIKSI
            </div>
            <div className="text-[10px] text-slate-400 tracking-[.18em]">
              INVENTORY SYSTEM
            </div>
          </div>
          <button
            className="ml-auto lg:hidden"
            onClick={() => setMobile(false)}
          >
            <X />
          </button>
        </div>
        <div className="text-[10px] font-bold tracking-[.2em] text-slate-500 px-3 mb-3">
          MENU UTAMA
        </div>
        <nav className="space-y-1">
          {nav
            .filter(
              (n) =>
                user.role === "admin" ||
                !["/barang-masuk", "/pengguna"].includes(n[0]),
            )
.map(([href, label, Icon]) => (
  <Link
    key={href}
    onClick={() => setMobile(false)}
    className={`nav-link ${path === href ? "active" : ""}`}
    href={href}
  >
                <Icon size={18} />
                {label}
              </Link>
            ))}
        </nav>
        <div className="mt-auto border-t border-slate-700 pt-4">
          <div className="flex items-center gap-3 px-2">
            <div className="w-9 h-9 rounded-full bg-blue-500 flex items-center justify-center font-bold text-sm">
              {user.username.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold truncate">{user.username}</div>
              <div className="text-xs text-slate-400 capitalize">
                {user.role}
              </div>
            </div>
            <button
              onClick={logout}
              title="Keluar"
              className="ml-auto text-slate-400 hover:text-white"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>
      <main className="lg:ml-[260px] min-h-screen">
        <header className="h-[76px] bg-white border-b border-slate-200/70 flex items-center justify-between px-5 md:px-9 sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <button className="lg:hidden" onClick={() => setMobile(true)}>
              <Menu />
            </button>
            <div>
              <div className="font-display font-extrabold text-lg">{title}</div>
              <div className="text-xs muted hidden sm:block">
                Kelola operasional inventaris teknisi
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 bg-slate-50 border rounded-full px-3 py-2 text-xs muted">
              <span className="w-2 h-2 bg-emerald-500 rounded-full" /> Sistem
              aktif
            </div>
            <div className="w-9 h-9 bg-blue-50 text-blue-700 rounded-full flex items-center justify-center font-bold">
              {user.username[0].toUpperCase()}
            </div>
          </div>
        </header>
        <div className="p-5 md:p-9 max-w-[1500px] mx-auto">
{notice && (
            <div
              role={noticeError ? "alert" : "status"}
              aria-live={noticeError ? "assertive" : "polite"}
              className={`fixed right-4 top-20 z-[70] flex w-[min(420px,calc(100vw-2rem))] items-start gap-3 rounded-2xl border bg-white p-4 text-sm shadow-xl ${
                noticeError
                  ? "border-rose-200 text-rose-800"
                  : "border-emerald-200 text-slate-700"
              }`}
            >
              <span
                className={`mt-0.5 ${
                  noticeError ? "text-rose-600" : "text-emerald-600"
                }`}
              >
                {noticeError ? (
                  <AlertCircle size={19} />
                ) : (
                  <CheckCircle2 size={19} />
                )}
              </span>
              <p className="flex-1 leading-6">{notice}</p>
              <button
                aria-label="Tutup notifikasi"
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                onClick={() => setNotice("")}
              >
                <X size={17} />
              </button>
            </div>
          )}
          {path === "/dashboard" && (
            <>
              <div className="mb-7">
                <h1 className="font-display text-2xl font-extrabold">
                  Ringkasan Inventaris
                </h1>
                <p className="muted text-sm mt-1">
                  Pantau kondisi persediaan dan aktivitas terbaru.
                </p>
              </div>
              <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
{stats.map(({ label, value, icon: Icon, color }) => (
  <div key={label} className="panel p-5">
                    <div className="flex justify-between">
                      <span className="text-sm muted font-semibold">
                        {label}
                      </span>
                      <span
                        className={`p-2 rounded-xl bg-${color}-50 text-${color}-600`}
                      >
                        <Icon size={19} />
                      </span>
                    </div>
                    <div className="font-display text-3xl font-extrabold mt-4">
                      {value}
                    </div>
                    <div className="text-xs muted mt-1">
                      Data inventaris saat ini
                    </div>
                  </div>
                ))}
              </div>
              <div className="grid xl:grid-cols-5 gap-5">
                <section className="panel xl:col-span-3">
                  <div className="p-5 flex justify-between items-center">
                    <div>
                      <b className="font-display">Aktivitas Terbaru</b>
                      <p className="text-xs muted mt-1">
                        Transaksi inventaris terakhir
                      </p>
                    </div>
                    <Link
                      className="text-blue-600 text-xs font-bold"
                      href="/histori"
                    >
                      Lihat semua →
                    </Link>
                  </div>
                  <HistoryTable rows={hist.slice(0, 7)} />
                </section>
                <section className="panel xl:col-span-2">
                  <div className="p-5">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="text-amber-500" size={19} />
                      <b className="font-display">Peringatan Stok</b>
                    </div>
                    <p className="text-xs muted mt-1">
                      Barang dengan stok 5 unit atau kurang
                    </p>
                  </div>
                  {low.length ? (
                    low.slice(0, 7).map((x) => (
                      <div key={x.id} className="px-5 py-3 border-t flex justify-between">
                        <div>
                          <div className="text-sm font-semibold">{x.name}</div>
                          <div className="text-xs muted">
                            {x.category || "Tanpa kategori"}
                          </div>
                        </div>
                        <span className="text-xs font-bold text-amber-700 bg-amber-50 rounded-lg px-2 py-1 h-fit">
                          {x.stock} unit
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="p-8 text-center text-sm muted">
                      Semua stok dalam kondisi aman.
                    </div>
                  )}
                </section>
              </div>
            </>
          )}
          {path === "/inventaris" && (
            <>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div>
                  <h1 className="font-display text-2xl font-extrabold">
                    Master Barang
                  </h1>
                  <p className="muted text-sm mt-1">
                    Daftar dan pengelolaan persediaan.
                  </p>
                </div>
                <div className="flex gap-2">
                  <div className="relative">
                    <Search
                      className="absolute left-3 top-3 text-slate-400"
                      size={16}
                    />
                    <input
                      className="field pl-9"
                      placeholder="Cari barang..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              {user.role === "admin" && (
                <section className="panel p-5 mb-5">
                  <b className="font-display">Tambah Barang Baru</b>
                  <div className="grid md:grid-cols-4 gap-3 mt-4">
                    <input
                      className="field"
                      placeholder="Nama barang"
                      value={form.name}
                      onChange={(e) => set("name", e.target.value)}
                    />
                    <input
                      className="field"
                      placeholder="Kategori"
                      value={form.category}
                      onChange={(e) => set("category", e.target.value)}
                    />
                    <input
                      className="field"
                      type="number"
                      min="0"
                      placeholder="Stok awal"
                      value={form.stock}
                      onChange={(e) => set("stock", e.target.value)}
                    />
                    <button
                      disabled={busy}
                      className="btn btn-primary"
                      onClick={() =>
                        act(async () => {
                          await api("/api/items", "POST", {
                            name: form.name,
                            category: form.category,
                            stock: form.stock,
                          });
                        })
                      }
                    >
                      <Plus size={16} /> Tambah Barang
                    </button>
                  </div>
                </section>
              )}
              <section className="panel">
                <div className="p-5 flex justify-between items-center">
                  <b className="font-display">Daftar Inventaris</b>
                  <div className="flex gap-2 items-center">
                    {user.role === "admin" && (
                      <>
                        <Link className="btn btn-soft" href="/api/export/excel">
                          <Download size={14} /> Excel
                        </Link>
                        <Link className="btn btn-soft" href="/api/export/pdf">
                          <Download size={14} /> PDF
                        </Link>
                      </>
                    )}
                    <span className="text-xs muted">
                      {filtered.length} barang
                    </span>
                  </div>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Nama Barang</th>
                        <th>Kategori</th>
                        <th>Stok</th>
                        <th>Status</th>
                        {user.role === "admin" && <th>Aksi</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((x) => (
                        <tr key={x.id}>
                          <td className="font-semibold">{x.name}</td>
                          <td>{x.category || "—"}</td>
                          <td className="font-bold">
                            {x.stock.toLocaleString("id-ID")}
                          </td>
                          <td>
                            <span
                              className={`text-xs rounded-full px-2.5 py-1 font-bold ${x.stock <= 5 ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}
                            >
                              {x.stock <= 5 ? "Menipis" : "Tersedia"}
                            </span>
                          </td>
                          {user.role === "admin" && (
                            <td>
                              <div className="flex gap-2">
                                <button
                                  className="btn btn-soft"
                                  onClick={() => {
                                    setEditingItem(x);
                                    setEditFields({
                                      name: x.name,
                                      category: x.category,
                                      stock: String(x.stock),
                                    });
                                  }}
                                >
                                  <Pencil size={14} /> Edit
                                </button>
                                <button
                                  className="btn btn-danger"
onClick={() =>
  setConfirmDialog({
    title: "Hapus barang?",
    message: `Barang "${x.name}" akan dihapus dari inventaris. Riwayat aktivitasnya tetap tersimpan.`,
    confirmLabel: "Ya, hapus barang",
    onConfirm: () =>
      act(() => api(`/api/items/${x.id}`, "DELETE")),
  })
}
                                >
                                  <Trash2 size={14} /> Hapus
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!filtered.length && (
                    <div className="p-10 text-center muted text-sm">
                      Belum ada barang yang cocok.
                    </div>
                  )}
                </div>
              </section>
            </>
          )}
          {["/barang-masuk", "/barang-keluar", "/barang-tarikan"].includes(
            path,
          ) && (
            <>
              <div className="mb-6">
                <h1 className="font-display text-2xl font-extrabold">
                  {title}
                </h1>
                <p className="muted text-sm mt-1">
                  Catat pergerakan barang dengan validasi stok otomatis.
                </p>
              </div>
              <section className="panel p-5 md:p-7 max-w-3xl">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold mb-2">
                      Pilih Barang
                    </label>
                    <select
                      className="field"
                      value={form.itemId}
                      onChange={(e) => set("itemId", e.target.value)}
                    >
                      <option value="">Pilih barang inventaris</option>
                      {items.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name} — stok {x.stock}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-2">
                      Jumlah
                    </label>
                    <input
                      className="field"
                      type="number"
                      min="1"
                      value={form.quantity}
                      onChange={(e) => set("quantity", e.target.value)}
                    />
                  </div>
                  {path !== "/barang-tarikan" && (
                    <div>
                      <label className="block text-xs font-bold mb-2">
                        Tujuan / Keperluan
                      </label>
                      <input
                        className="field"
                        value={form.purpose}
                        onChange={(e) => set("purpose", e.target.value)}
                        placeholder="Keperluan transaksi"
                      />
                    </div>
                  )}
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold mb-2">
                      {path === "/barang-tarikan"
                        ? "Alasan Penarikan"
                        : "Catatan"}
                    </label>
                    <textarea
                      className="field"
                      rows={3}
                      value={
                        path === "/barang-tarikan" ? form.reason : form.note
                      }
                      onChange={(e) =>
                        set(
                          path === "/barang-tarikan" ? "reason" : "note",
                          e.target.value,
                        )
                      }
                      placeholder="Tambahkan keterangan..."
                    />
                  </div>
                </div>
                <div className="mt-6 flex justify-end">
                  <button
                    disabled={busy}
                    className="btn btn-primary"
                    onClick={() =>
                      act(async () => {
                        const line = {
                          itemId: form.itemId,
                          quantity: form.quantity,
                        };
                        if (path === "/barang-tarikan")
                          await api("/api/withdrawals", "POST", {
                            items: [line],
                            reason: form.reason,
                          });
                        else
                          await api("/api/transactions", "POST", {
                            type: path === "/barang-masuk" ? "in" : "out",
                            items: [line],
                            purpose: form.purpose,
                            note: form.note,
                          });
                      })
                    }
                  >
                    Simpan Transaksi
                  </button>
                </div>
              </section>
            </>
          )}
          {path === "/histori" && (
            <>
              <div className="mb-6">
                <h1 className="font-display text-2xl font-extrabold">
                  Riwayat Aktivitas
                </h1>
                <p className="muted text-sm mt-1">
                  Jejak perubahan stok dan transaksi inventaris.
                </p>
              </div>
              <section className="panel">
                <HistoryTable rows={hist} />
              </section>
            </>
          )}
          {path === "/pengguna" && user.role === "admin" && (
            <>
              <div className="mb-6">
                <h1 className="font-display text-2xl font-extrabold">
                  Manajemen Pengguna
                </h1>
                <p className="muted text-sm mt-1">
                  Kelola akun administrator dan pengguna.
                </p>
              </div>
              <section className="panel p-5 mb-5">
                <b className="font-display">Buat Akun Baru</b>
                <div className="grid md:grid-cols-4 gap-3 mt-4">
                  <input
                    className="field"
                    placeholder="Username"
                    value={form.username}
                    onChange={(e) => set("username", e.target.value)}
                  />
                  <input
                    className="field"
                    type="password"
                    placeholder="Password min. 10 karakter"
                    value={form.password}
                    onChange={(e) => set("password", e.target.value)}
                  />
                  <select
                    className="field"
                    value={form.role}
                    onChange={(e) => set("role", e.target.value)}
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button
                    className="btn btn-primary"
                    disabled={busy}
                    onClick={() =>
                      act(() =>
                        api("/api/users", "POST", {
                          username: form.username,
                          password: form.password,
                          role: form.role,
                        }),
                      )
                    }
                  >
                    <Plus size={16} /> Buat Akun
                  </button>
                </div>
              </section>
              <section className="panel">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Username</th>
                        <th>Role</th>
                        <th>Dibuat</th>
                        <th>Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((x) => (
                        <tr key={x.id}>
                          <td className="font-semibold">{x.username}</td>
                          <td className="capitalize">{x.role}</td>
                          <td>—</td>
                          <td>
                            <button
                              className="btn btn-danger"
onClick={() =>
  setConfirmDialog({
    title: "Hapus akun pengguna?",
    message: `Akun "${x.username}" tidak akan bisa digunakan lagi setelah dihapus.`,
    confirmLabel: "Ya, hapus akun",
    onConfirm: () =>
      act(() => api(`/api/users/${x.id}`, "DELETE")),
  })
}
                            >
                              <Trash2 size={14} /> Hapus
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
          {path === "/pengaturan" && (
            <>
              <div className="mb-6">
                <h1 className="font-display text-2xl font-extrabold">
                  Pengaturan Akun
                </h1>
                <p className="muted text-sm mt-1">
                  Perbarui kredensial keamanan akun.
                </p>
              </div>
              <section className="panel p-6 max-w-xl">
                <b className="font-display">Ganti Password</b>
                <div className="space-y-4 mt-5">
                  <input
                    className="field"
                    type="password"
                    placeholder="Password saat ini"
                    value={form.oldPassword}
                    onChange={(e) => set("oldPassword", e.target.value)}
                  />
                  <input
                    className="field"
                    type="password"
                    placeholder="Password baru (min. 10 karakter)"
                    value={form.newPassword}
                    onChange={(e) => set("newPassword", e.target.value)}
                  />
                  <input
                    className="field"
                    type="password"
                    placeholder="Konfirmasi password baru"
                    value={form.confirmPassword}
                    onChange={(e) => set("confirmPassword", e.target.value)}
                  />
                  <button
                    className="btn btn-primary"
                    disabled={busy}
                    onClick={() =>
                      act(() =>
                        api("/api/change-password", "POST", {
                          oldPassword: form.oldPassword,
                          newPassword: form.newPassword,
                          confirmPassword: form.confirmPassword,
                        }),
                      )
                    }
                  >
                    Simpan Password
                  </button>
                </div>
              </section>
              <section className="panel p-6 max-w-xl mt-5">
                <b className="font-display">Backup Data</b>
                <p className="text-sm muted mt-2">
                  Unduh salinan data dalam format JSON untuk arsip dan pemulihan
                  manual.
                </p>
                <Link className="btn btn-soft mt-4" href="/api/backup">
                  <Download size={16} /> Unduh Backup
                </Link>
              </section>
            </>
          )}
        </div>
      </main>

      {/* Dialog edit barang */}
      {editingItem && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setEditingItem(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-item-title"
            className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl sm:p-7"
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <span className="mb-2 inline-flex rounded-xl bg-blue-50 p-2.5 text-blue-600">
                  <Pencil size={19} />
                </span>
                <h2 id="edit-item-title" className="font-display text-xl font-extrabold">
                  Edit Data Barang
                </h2>
                <p className="mt-1 text-sm muted">
                  Perbarui informasi inventaris.
                </p>
              </div>
              <button
                type="button"
                aria-label="Tutup dialog"
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"
                onClick={() => setEditingItem(null)}
              >
                <X size={19} />
              </button>
            </div>

            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (!editingItem) return;
                const item = editingItem;
                void act(async () => {
                  await api(`/api/items/${item.id}`, "PUT", {
                    name: editFields.name.trim(),
                    category: editFields.category.trim(),
                    stock: Number(editFields.stock),
                  });
                  setEditingItem(null);
                });
              }}
            >
              <label className="block text-sm font-semibold">
                Nama Barang
                <input
                  autoFocus
                  required
                  maxLength={120}
                  className="field mt-2"
                  value={editFields.name}
                  onChange={(e) =>
                    setEditFields((current) => ({
                      ...current,
                      name: e.target.value,
                    }))
                  }
                />
              </label>

              <label className="block text-sm font-semibold">
                Kategori
                <input
                  maxLength={80}
                  className="field mt-2"
                  value={editFields.category}
                  onChange={(e) =>
                    setEditFields((current) => ({
                      ...current,
                      category: e.target.value,
                    }))
                  }
                />
              </label>

              <label className="block text-sm font-semibold">
                Stok
                <input
                  required
                  type="number"
                  min="0"
                  step="1"
                  className="field mt-2"
                  value={editFields.stock}
                  onChange={(e) =>
                    setEditFields((current) => ({
                      ...current,
                      stock: e.target.value,
                    }))
                  }
                />
              </label>

              <div className="flex flex-col-reverse gap-2 pt-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  className="btn btn-soft"
                  onClick={() => setEditingItem(null)}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={
                    busy ||
                    !editFields.name.trim() ||
                    editFields.stock === "" ||
                    !Number.isSafeInteger(Number(editFields.stock)) ||
                    Number(editFields.stock) < 0
                  }
                  className="btn btn-primary"
                >
                  <Save size={16} />
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* Dialog konfirmasi hapus */}
      {confirmDialog && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setConfirmDialog(null);
          }}
        >
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby="confirm-message"
            className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl sm:p-7"
          >
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
              <AlertCircle size={23} />
            </div>
            <h2 id="confirm-title" className="font-display text-xl font-extrabold">
              {confirmDialog.title}
            </h2>
            <p id="confirm-message" className="mt-2 text-sm leading-6 muted">
              {confirmDialog.message}
            </p>
            <div className="mt-7 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="btn btn-soft"
                onClick={() => setConfirmDialog(null)}
              >
                Batal
              </button>
              <button
                type="button"
                disabled={busy}
                className="btn btn-danger"
                onClick={() => {
                  const action = confirmDialog.onConfirm;
                  setConfirmDialog(null);
                  void action();
                }}
              >
                <Trash2 size={15} />
                {confirmDialog.confirmLabel}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
function HistoryTable({ rows }: { rows: Hist[] }) {
  const label: Record<string, string> = {
    in: "Barang Masuk",
    out: "Barang Keluar",
    withdraw: "Barang Tarikan",
    added: "Barang Baru",
    adjustment: "Penyesuaian",
  };
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Waktu</th>
            <th>Aktivitas</th>
            <th>Barang</th>
            <th>Jumlah</th>
            <th>Perubahan Stok</th>
            <th>Oleh</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="whitespace-nowrap">
                {new Date(r.createdAt).toLocaleString("id-ID")}
              </td>
              <td>
                <span className="text-xs font-bold bg-slate-100 rounded-lg px-2 py-1">
                  {label[r.type] || r.type}
                </span>
              </td>
              <td className="font-semibold">{r.itemName}</td>
              <td>{r.quantity}</td>
              <td>
                {r.before} → <b>{r.after}</b>
              </td>
              <td>{r.createdBy}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && (
        <div className="p-10 text-center muted text-sm">
          Belum ada riwayat aktivitas.
        </div>
      )}
    </div>
  );
}
