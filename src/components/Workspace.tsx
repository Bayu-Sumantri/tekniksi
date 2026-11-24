"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { alertError, alertSuccess, alertWarning, confirmAction, showLoading, closeAlert } from "@/lib/alerts";
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
  Save,
} from "lucide-react";
const isAdmin = (role: string) => role === "admin" || role === "super_admin";

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
    [mobile, setMobile] = useState(false),
    [busy, setBusy] = useState(false),
    [initialLoading, setInitialLoading] = useState(true);

  // State dialog edit barang
  const [editingItem, setEditingItem] = useState<Item | null>(null);

  const [editFields, setEditFields] = useState({
    name: "",
    category: "",
    stock: "0",
  });

  // State konfirmasi penghapusan
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
  const [transactionLines, setTransactionLines] = useState([
    { itemId: "", quantity: "1" },
  ]);
  const [bulkRows, setBulkRows] = useState([{ name: "", category: "", stock: "1" }]);
  const [approvalCode, setApprovalCode] = useState("");
  const [generatedApprovalCode, setGeneratedApprovalCode] = useState("");
  const [approvalCodeExpiresAt, setApprovalCodeExpiresAt] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [historyFilter, setHistoryFilter] = useState<
    "all" | "in" | "out" | "withdraw"
  >("all");

  function updateTransactionLine(
    index: number,
    field: "itemId" | "quantity",
    value: string,
  ) {
    setTransactionLines((previous) =>
      previous.map((line, i) =>
        i === index ? { ...line, [field]: value } : line,
      ),
    );
  }

  function addTransactionLine() {
    setTransactionLines((previous) => [
      ...previous,
      { itemId: "", quantity: "1" },
    ]);
  }

  function removeTransactionLine(index: number) {
    setTransactionLines((previous) =>
      previous.filter((_, i) => i !== index),
    );
  }
  async function api(url: string, method = "GET", body?: unknown) {
    const r = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const d = await r.json();
    if (!r.ok) throw Error(r.status === 401 ? "Sesi berakhir. Silakan login kembali." : r.status === 403 ? (d.error || "Akun tidak memiliki akses untuk tindakan ini.") : (d.error || "Permintaan gagal."));
    return d;
  }
  const refresh = useCallback(async () => {
    try {
      const d = await api("/api/data");
      setItems(d.items);
      setHist(d.history);
      if (isAdmin(user.role)) {
        const a = await api("/api/users");
        setUsers(a.users);
      }
    } finally { setInitialLoading(false); }
  }, [user.role]);
  useEffect(() => {
    refresh().catch((e) => { void alertError("Gagal memuat data", e instanceof Error ? e.message : "Silakan muat ulang halaman."); });
  }, [refresh]);
  const filtered = useMemo(
    () =>
      items.filter((x) =>
        (x.name + " " + x.category + " " + x.stock)
          .toLocaleLowerCase("id-ID")
          .includes(search.trim().toLocaleLowerCase("id-ID")),
      ),
    [items, search],
  );
  const filteredHistory = useMemo(() => {
    const query = historySearch.trim().toLocaleLowerCase("id-ID");
    const byType = historyFilter === "all"
      ? hist
      : historyFilter === "in"
        ? hist.filter((entry) => entry.type === "in" || entry.type === "bulk_in")
        : hist.filter((entry) => entry.type === historyFilter);

    if (!query) return byType;

    const activityLabels: Record<string, string> = {
      in: "barang masuk", bulk_in: "input massal barang masuk",
      out: "barang keluar", withdraw: "barang tarikan",
      added: "barang baru tambah", adjustment: "penyesuaian",
      edited: "edit barang", deleted: "hapus barang",
    };

    return byType.filter((entry) => {
      const searchable = [
        entry.itemName, entry.type, activityLabels[entry.type],
        entry.createdBy, entry.purpose, entry.note,
        entry.quantity, entry.before, entry.after,
        new Date(entry.createdAt).toLocaleString("id-ID"),
        new Date(entry.createdAt).toISOString(),
      ].filter((value) => value !== null && value !== undefined).join(" ").toLocaleLowerCase("id-ID");
      return searchable.includes(query);
    });
  }, [hist, historyFilter, historySearch]);
  // Rekap Barang Tarikan dihitung dari histori Barang Keluar dikurangi
  // histori Barang Tarikan. Barang yang belum pernah keluar tidak akan muncul.
  const withdrawalSummary = useMemo(() => {
    const totals = new Map<string, { keluar: number; ditarik: number }>();

    for (const entry of hist) {
      if (entry.type !== "out" && entry.type !== "withdraw") continue;
      const current = totals.get(entry.itemName) || { keluar: 0, ditarik: 0 };
      if (entry.type === "out") current.keluar += entry.quantity;
      if (entry.type === "withdraw") current.ditarik += entry.quantity;
      totals.set(entry.itemName, current);
    }

    return items
      .map((item) => {
        const total = totals.get(item.name) || { keluar: 0, ditarik: 0 };
        return {
          ...item,
          totalKeluar: total.keluar,
          totalDitarik: total.ditarik,
          tersediaDitarik: Math.max(0, total.keluar - total.ditarik),
        };
      })
      .filter((item) => item.totalKeluar > 0);
  }, [hist, items]);

  const withdrawalAvailability = useMemo(
    () => new Map(withdrawalSummary.map((item) => [item.id, item.tersediaDitarik])),
    [withdrawalSummary],
  );
  const [withdrawalModalOpen, setWithdrawalModalOpen] = useState(false);
  const [withdrawalPage, setWithdrawalPage] = useState(0);
  const withdrawalPageSize = 5;
  const withdrawalPageCount = Math.ceil(
    withdrawalSummary.length / withdrawalPageSize,
  );
  const visibleWithdrawalRows = withdrawalSummary.slice(0, withdrawalPageSize);
  const pagedWithdrawalRows = withdrawalSummary.slice(
    withdrawalPage * withdrawalPageSize,
    (withdrawalPage + 1) * withdrawalPageSize,
  );

  // Dropdown Barang Tarikan hanya menampilkan barang yang masih memiliki
  // kuantitas keluar dan belum ditarik kembali seluruhnya.
  const selectableTransactionItems =
    path === "/barang-tarikan"
      ? withdrawalSummary.filter((item) => item.tersediaDitarik > 0)
      : items;
  const title = nav.find((x) => x[0] === path)?.[1] || "Dashboard";
  function set(k: string, v: string) {
    setForm((p) => ({ ...p, [k]: v }));
  }
  async function act(fn: () => Promise<unknown>, successMessage = "Perubahan berhasil disimpan.") {
    setBusy(true);
    showLoading("Menyimpan perubahan...");
    try {
      await fn();
      await refresh();
      closeAlert();
      await alertSuccess("Berhasil", successMessage);
      setForm({ name: "", category: "", stock: "0", itemId: "", quantity: "1", purpose: "", note: "", reason: "", username: "", password: "", role: "user", oldPassword: "", newPassword: "", confirmPassword: "" });
      setTransactionLines([{ itemId: "", quantity: "1" }]);
    } catch (e) {
      closeAlert();
      await alertError("Proses gagal", e instanceof Error ? e.message : "Terjadi kesalahan.");
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    if (!(await confirmAction("Keluar dari Tekniksi?", "Sesi akun Anda akan diakhiri.", "Ya, logout"))) return;
    showLoading("Mengakhiri sesi...");
    try { await api("/api/logout", "POST", {}); closeAlert(); await alertSuccess("Berhasil logout", "Anda akan diarahkan ke halaman login."); location.href = "/login"; }
    catch (e) { closeAlert(); await alertError("Logout gagal", e instanceof Error ? e.message : "Silakan coba lagi."); }
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
      {initialLoading && (
        <div className="fixed inset-0 z-[60] bg-slate-50/95 p-4 sm:p-8" role="status" aria-label="Memuat data Tekniksi">
          <div className="mx-auto max-w-7xl space-y-6">
            <div className="flex items-center gap-3"><div className="skeleton h-11 w-11 rounded-xl"/><div className="flex-1 space-y-2"><div className="skeleton h-4 w-36"/><div className="skeleton h-3 w-52"/></div></div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{[1,2,3,4].map((n) => <div key={n} className="panel p-5 space-y-3"><div className="skeleton h-3 w-24"/><div className="skeleton h-8 w-20"/><div className="skeleton h-3 w-32"/></div>)}</div>
            <div className="panel space-y-4 p-5">{[1,2,3,4,5,6].map((n) => <div key={n} className="flex gap-3"><div className="skeleton h-9 w-9"/><div className="flex-1 space-y-2"><div className="skeleton h-3 w-2/5"/><div className="skeleton h-3 w-4/5"/></div></div>)}</div>
            <p className="text-center text-xs font-semibold text-slate-500">Menyiapkan data Tekniksi…</p>
          </div>
        </div>
      )}
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
                isAdmin(user.role) ||
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
              <div className="text-xs text-slate-400">
                {user.role === "super_admin" ? "Admin Besar" : user.role === "admin" ? "Admin" : "User"}
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
                      placeholder="Cari nama atau kategori barang..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              {isAdmin(user.role) && (
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
                        }, "Barang berhasil ditambahkan.")
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
                    {isAdmin(user.role) && (
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
                        {isAdmin(user.role) && <th>Aksi</th>}
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
                          {isAdmin(user.role) && (
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
onClick={async () => {
  if (await confirmAction("Hapus barang?", `Barang "${x.name}" akan dihapus. Riwayat aktivitas tetap disimpan.`, "Ya, hapus barang")) {
    await act(() => api(`/api/items/${x.id}`, "DELETE"), "Barang berhasil dihapus.");
  }
}}
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
              {path === "/barang-tarikan" && (
                <section className="panel mb-5 max-w-5xl p-5 md:p-6">
                  <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="font-display text-lg font-extrabold">
                        Daftar Barang yang Pernah Keluar
                      </h2>
                      <p className="muted mt-1 text-sm">
                        Hanya barang yang memiliki riwayat Barang Keluar. Daftar utama menampilkan maksimal 5 barang.
                      </p>
                    </div>
                    <span className="w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                      {withdrawalSummary.length} jenis barang
                    </span>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Nama Barang</th>
                          <th>Total Keluar</th>
                          <th>Sudah Ditarik</th>
                          <th>Bisa Ditarik</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleWithdrawalRows.map((item) => (
                          <tr key={item.id}>
                            <td className="font-semibold">{item.name}</td>
                            <td>{item.totalKeluar}</td>
                            <td>{item.totalDitarik}</td>
                            <td>
                              <span className={`rounded-lg px-2 py-1 text-xs font-bold ${item.tersediaDitarik > 0 ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                                {item.tersediaDitarik}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!withdrawalSummary.length && (
                      <div className="p-8 text-center text-sm muted">
                        Belum ada data Barang Keluar. Barang akan muncul di sini setelah dicatat pada menu Barang Keluar.
                      </div>
                    )}
                  </div>
                  {withdrawalSummary.length > withdrawalPageSize && (
                    <div className="mt-4 flex justify-center">
                      <button
                        type="button"
                        className="btn btn-soft"
                        onClick={() => {
                          setWithdrawalPage(0);
                          setWithdrawalModalOpen(true);
                        }}
                      >
                        Lihat Selengkapnya ({withdrawalSummary.length - withdrawalPageSize} lainnya)
                      </button>
                    </div>
                  )}
                </section>
              )}
              {path === "/barang-tarikan" && withdrawalModalOpen && (
                <div
                  className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
                  onMouseDown={(e) => {
                    if (e.target === e.currentTarget) setWithdrawalModalOpen(false);
                  }}
                >
                  <section
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="withdrawal-list-title"
                    className="max-h-[85vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl md:p-7"
                  >
                    <div className="mb-5 flex items-start justify-between gap-4">
                      <div>
                        <h2 id="withdrawal-list-title" className="font-display text-xl font-extrabold">
                          Semua Barang yang Pernah Keluar
                        </h2>
                        <p className="muted mt-1 text-sm">
                          Halaman {withdrawalPage + 1} dari {Math.max(withdrawalPageCount, 1)} · 5 barang per halaman
                        </p>
                      </div>
                      <button
                        type="button"
                        className="btn btn-soft shrink-0"
                        onClick={() => setWithdrawalModalOpen(false)}
                        aria-label="Tutup daftar barang"
                      >
                        <X size={17} />
                        Tutup
                      </button>
                    </div>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Nama Barang</th>
                            <th>Total Keluar</th>
                            <th>Sudah Ditarik</th>
                            <th>Bisa Ditarik</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pagedWithdrawalRows.map((item) => (
                            <tr key={item.id}>
                              <td className="font-semibold">{item.name}</td>
                              <td>{item.totalKeluar}</td>
                              <td>{item.totalDitarik}</td>
                              <td>
                                <span className={`rounded-lg px-2 py-1 text-xs font-bold ${item.tersediaDitarik > 0 ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                                  {item.tersediaDitarik}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-5 flex items-center justify-between gap-3">
                      <button
                        type="button"
                        className="btn btn-soft"
                        disabled={withdrawalPage === 0}
                        onClick={() => setWithdrawalPage((page) => Math.max(0, page - 1))}
                      >
                        Sebelumnya
                      </button>
                      <span className="text-xs font-semibold muted">
                        {withdrawalPage + 1} / {Math.max(withdrawalPageCount, 1)}
                      </span>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={withdrawalPage + 1 >= withdrawalPageCount}
                        onClick={() => setWithdrawalPage((page) => Math.min(withdrawalPageCount - 1, page + 1))}
                      >
                        Berikutnya
                      </button>
                    </div>
                  </section>
                </div>
              )}
              {path === "/barang-masuk" && isAdmin(user.role) && (
                <section className="panel mb-5 max-w-5xl p-5 md:p-7">
                  <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h2 className="font-display text-lg font-extrabold">Input Banyak Barang Sekaligus</h2>
                      <p className="muted mt-1 text-sm">Masukkan beberapa data barang awal dalam satu proses transaksi.</p>
                    </div>
                    <span className="w-fit rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">Persetujuan Admin Besar</span>
                  </div>

                  {user.role === "super_admin" ? (
                    <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-bold text-blue-950">Generator kode persetujuan</p>
                          <p className="mt-1 text-sm text-blue-800">Buat kode acak 6 digit untuk diberikan kepada Admin. Kode hanya berlaku 15 menit dan hanya bisa dipakai sekali.</p>
                        </div>
                        <button type="button" className="btn btn-primary shrink-0" disabled={busy} onClick={async () => {
                          setBusy(true);
                          showLoading("Membuat kode persetujuan...");
                          try {
                            const result = await api("/api/bulk-codes", "POST", {});
                            setGeneratedApprovalCode(result.code);
                            setApprovalCodeExpiresAt(result.expiresAt);
                            closeAlert();
                            await alertSuccess("Kode berhasil dibuat", "Berikan kode ini kepada Admin. Kode hanya dapat digunakan satu kali dan berlaku selama 15 menit.");
                          } catch (error) {
                            closeAlert();
                            await alertError("Gagal membuat kode", error instanceof Error ? error.message : "Terjadi kesalahan.");
                          } finally {
                            setBusy(false);
                          }
                        }}><Plus size={15} /> Generate Kode</button>
                      </div>
                      {generatedApprovalCode && (
                        <div className="mt-4 rounded-lg border border-blue-200 bg-white p-4">
                          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Kode persetujuan aktif</p>
                          <div className="mt-2 flex flex-wrap items-center gap-3">
                            <code className="text-3xl font-extrabold tracking-[0.25em] text-blue-700">{generatedApprovalCode}</code>
                            <button type="button" className="btn btn-soft" onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(generatedApprovalCode);
                                await alertSuccess("Kode disalin", "Kode persetujuan berhasil disalin.");
                              } catch {
                                await alertWarning("Tidak dapat menyalin", "Silakan salin kode secara manual.");
                              }
                            }}>Salin Kode</button>
                          </div>
                          <p className="mt-2 text-xs text-slate-500">Berlaku sampai: {new Date(approvalCodeExpiresAt).toLocaleString("id-ID")}. Generate kode baru akan menonaktifkan kode aktif sebelumnya milik Anda.</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
                      <p className="text-sm text-amber-900">Admin biasa dapat menyiapkan input massal, tetapi wajib memasukkan kode persetujuan 6 digit dari Admin Besar sebelum mengirim data.</p>
                      <label className="mt-3 block text-xs font-bold text-amber-950">Kode Persetujuan Admin Besar</label>
                      <input
                        className="field mt-2 max-w-xs text-center text-xl font-extrabold tracking-[0.3em]"
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        placeholder="000000"
                        value={approvalCode}
                        onChange={(event) => setApprovalCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                      />
                    </div>
                  )}

                  <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                    Seluruh barang akan disimpan dalam satu transaksi database. Jika salah satu baris gagal, seluruh proses dibatalkan.
                  </div>
                  <div className="space-y-3">
                    {bulkRows.map((row, index) => (
                      <div key={index} className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 p-3 md:grid-cols-12">
                        <div className="md:col-span-5">
                          <label className="mb-2 block text-xs font-bold">Nama Barang {index + 1}</label>
                          <input className="field" maxLength={100} placeholder="Nama barang" value={row.name} onChange={(event) => setBulkRows((rows) => rows.map((item, i) => i === index ? { ...item, name: event.target.value } : item))} />
                        </div>
                        <div className="md:col-span-4">
                          <label className="mb-2 block text-xs font-bold">Kategori</label>
                          <input className="field" maxLength={60} placeholder="Kategori barang" value={row.category} onChange={(event) => setBulkRows((rows) => rows.map((item, i) => i === index ? { ...item, category: event.target.value } : item))} />
                        </div>
                        <div className="md:col-span-2">
                          <label className="mb-2 block text-xs font-bold">Stok Awal</label>
                          <input className="field" type="number" min="0" max="100000000" step="1" value={row.stock} onChange={(event) => setBulkRows((rows) => rows.map((item, i) => i === index ? { ...item, stock: event.target.value } : item))} />
                        </div>
                        <div className="flex items-end md:col-span-1">
                          <button type="button" className="btn btn-danger w-full" title="Hapus baris" disabled={bulkRows.length === 1} onClick={() => setBulkRows((rows) => rows.filter((_, i) => i !== index))}><Trash2 size={15} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" className="btn btn-soft" disabled={bulkRows.length >= 500} onClick={() => setBulkRows((rows) => [...rows, { name: "", category: "", stock: "1" }])}><Plus size={15} /> Tambah Baris</button>
                      <button type="button" className="btn" disabled={bulkRows.length === 1} onClick={() => setBulkRows((rows) => rows.slice(0, -1))}><Trash2 size={15} /> Hapus Baris Terakhir</button>
                    </div>
                    <div className="flex flex-col gap-2 sm:items-end">
                      <p className="text-sm font-semibold">{bulkRows.length} barang akan diproses</p>
                      <button type="button" className="btn btn-primary" disabled={busy || !bulkRows.length || (user.role === "admin" && approvalCode.length !== 6)} onClick={async () => {
                        const payload = bulkRows.map((row) => ({ name: row.name.trim(), category: row.category.trim(), stock: Number(row.stock) }));
                        if (payload.some((row) => !row.name || !Number.isSafeInteger(row.stock) || row.stock < 0 || row.stock > 100000000)) {
                          await alertError("Data belum valid", "Pastikan setiap nama barang terisi dan stok berupa bilangan bulat minimal 0.");
                          return;
                        }
                        const names = payload.map((row) => row.name.toLocaleLowerCase("id-ID"));
                        if (new Set(names).size !== names.length) {
                          await alertWarning("Nama barang duplikat", "Setiap nama barang dalam input massal harus unik.");
                          return;
                        }
                        if (user.role === "admin" && approvalCode.length !== 6) {
                          await alertWarning("Kode diperlukan", "Masukkan kode persetujuan 6 digit dari Admin Besar.");
                          return;
                        }
                        if (await confirmAction("Proses input massal?", `${payload.length} barang akan ditambahkan. ${user.role === "admin" ? "Kode persetujuan akan digunakan dan tidak dapat dipakai ulang." : "Proses dilakukan langsung oleh Admin Besar."} Pastikan seluruh data sudah benar.`, "Ya, proses input")) {
                          await act(async () => {
                            await api("/api/bulk-items", "POST", { items: payload, ...(user.role === "admin" ? { approvalCode } : {}) });
                            setBulkRows([{ name: "", category: "", stock: "1" }]);
                            setApprovalCode("");
                          }, `${payload.length} barang berhasil ditambahkan melalui input massal.`);
                        }
                      }}>Proses Input Massal</button>
                    </div>
                  </div>
                </section>
              )}
              <section className="panel p-5 md:p-7 max-w-3xl">
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <label className="block text-xs font-bold">
                        Daftar Barang
                      </label>
                      <span className="text-xs muted">
                        {transactionLines.length} baris
                      </span>
                    </div>

                    {transactionLines.map((line, index) => {
                      const selectedIds = transactionLines
                        .filter((_, i) => i !== index)
                        .map((entry) => entry.itemId)
                        .filter(Boolean);

                      return (
                        <div
                          key={index}
                          className="grid grid-cols-1 md:grid-cols-12 gap-3 mb-3 p-3 rounded-xl border border-slate-200"
                        >
                          <div className="md:col-span-7">
                            <label className="block text-xs font-bold mb-2">
                              Barang {index + 1}
                            </label>
                            <select
                              className="field"
                              value={line.itemId}
                              onChange={(e) =>
                                updateTransactionLine(
                                  index,
                                  "itemId",
                                  e.target.value,
                                )
                              }
                            >
                              <option value="">Pilih barang inventaris</option>
                              {selectableTransactionItems.map((item) => (
                                <option
                                  key={item.id}
                                  value={item.id}
                                  disabled={selectedIds.includes(item.id)}
                                >
                                  {item.name}
                                  {path === "/barang-tarikan"
                                    ? ` — tersedia ditarik ${withdrawalAvailability.get(item.id) || 0}`
                                    : ` — stok ${item.stock}`}
                                </option>
                              ))}
                            </select>
                            {path === "/barang-tarikan" &&
                              selectableTransactionItems.length === 0 && (
                                <p className="mt-2 text-xs text-amber-700">
                                  Belum ada barang keluar yang masih bisa ditarik.
                                </p>
                              )}
                          </div>

                          <div className="md:col-span-3">
                            <label className="block text-xs font-bold mb-2">
                              Jumlah
                              {path === "/barang-tarikan" && line.itemId && (
                                <span className="ml-1 font-normal text-emerald-700">
                                  (maks. {withdrawalAvailability.get(line.itemId) || 0})
                                </span>
                              )}
                            </label>
                            <input
                              className="field"
                              type="number"
                              min="1"
                              max={path === "/barang-tarikan" && line.itemId ? withdrawalAvailability.get(line.itemId) || 1 : undefined}
                              step="1"
                              value={line.quantity}
                              onChange={(e) =>
                                updateTransactionLine(
                                  index,
                                  "quantity",
                                  e.target.value,
                                )
                              }
                            />
                          </div>

                          <div className="md:col-span-2 flex items-end">
                            <button
                              type="button"
                              disabled={transactionLines.length === 1}
                              onClick={() => removeTransactionLine(index)}
                              className="btn w-full"
                              title="Hapus barang"
                            >
                              <Trash2 size={16} />
                              Hapus
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    <button
                      type="button"
                      onClick={addTransactionLine}
                      className="btn"
                    >
                      <Plus size={16} />
                      Tambah Barang
                    </button>
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

                  <div>
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
                        const validLines = transactionLines
                          .filter((line) => line.itemId)
                          .map((line) => ({
                            itemId: line.itemId,
                            quantity: Number(line.quantity),
                          }));

                        if (validLines.length === 0) {
                          throw Error("Pilih minimal satu barang.");
                        }

                        if (
                          validLines.some(
                            (line) =>
                              !Number.isSafeInteger(line.quantity) ||
                              line.quantity < 1,
                          )
                        ) {
                          throw Error("Jumlah setiap barang minimal 1.");
                        }

                        if (path === "/barang-tarikan") {
                          const exceedsAvailable = validLines.some(
                            (line) =>
                              line.quantity > (withdrawalAvailability.get(line.itemId) || 0),
                          );
                          if (exceedsAvailable) {
                            throw Error("Jumlah tarikan melebihi jumlah barang yang masih bisa ditarik.");
                          }
                        }

                        if (
                          new Set(validLines.map((line) => line.itemId)).size !==
                          validLines.length
                        ) {
                          throw Error(
                            "Barang yang sama tidak boleh dipilih dua kali.",
                          );
                        }

                        if (path === "/barang-tarikan") {
                          await api("/api/withdrawals", "POST", {
                            items: validLines,
                            reason: form.reason,
                          });
                        } else {
                          await api("/api/transactions", "POST", {
                            type: path === "/barang-masuk" ? "in" : "out",
                            items: validLines,
                            purpose: form.purpose,
                            note: form.note,
                          });
                        }
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
                <div className="flex flex-col gap-4 border-b p-5">
                  <div className="relative w-full md:max-w-md">
                    <Search className="absolute left-3 top-3 text-slate-400" size={16} />
                    <input
                      className="field pl-9 pr-10 w-full"
                      type="search"
                      placeholder="Cari barang, aktivitas, pengguna, tanggal, atau keterangan..."
                      value={historySearch}
                      onChange={(e) => setHistorySearch(e.target.value)}
                      aria-label="Cari riwayat aktivitas"
                    />
                    {historySearch && (
                      <button
                        type="button"
                        className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-700"
                        onClick={() => setHistorySearch("")}
                        aria-label="Hapus pencarian riwayat"
                      >
                        <X size={17} />
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap gap-2">
                      {[
                        { value: "all", label: "Semua" },
                        ...(isAdmin(user.role)
                          ? [{ value: "in", label: "Barang Masuk" }]
                          : []),
                        { value: "out", label: "Barang Keluar" },
                        { value: "withdraw", label: "Barang Tarikan" },
                      ].map((tab) => (
                        <button
                          key={tab.value}
                          type="button"
                          aria-pressed={historyFilter === tab.value}
                          onClick={() =>
                            setHistoryFilter(
                              tab.value as "all" | "in" | "out" | "withdraw",
                            )
                          }
                          className={`btn ${
                            historyFilter === tab.value
                              ? "btn-primary"
                              : "btn-soft"
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    {isAdmin(user.role) && (
                      <div className="flex gap-2">
                        <a
                          className="btn btn-soft"
                          href={`/api/export/excel?type=${historyFilter}`}
                        >
                          <Download size={14} /> Excel
                        </a>
                        <a
                          className="btn btn-soft"
                          href={`/api/export/pdf?type=${historyFilter}`}
                        >
                          <Download size={14} /> PDF
                        </a>
                      </div>
                    )}
                  </div>

                  <p className="text-xs muted">
                    Menampilkan {filteredHistory.length} dari {hist.filter((entry) => historyFilter === "all" || (historyFilter === "in" ? entry.type === "in" || entry.type === "bulk_in" : entry.type === historyFilter)).length} riwayat aktivitas.
                  </p>
                </div>

                <HistoryTable rows={filteredHistory} />
              </section>
            </>
          )}
          {path === "/pengguna" && isAdmin(user.role) && (
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
                        "Pengguna berhasil dibuat.",
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
                            {(x.role !== "super_admin" || user.role === "super_admin") && <button
                              className="btn btn-danger"
onClick={async () => {
  if (await confirmAction("Hapus akun pengguna?", `Akun "${x.username}" tidak akan bisa digunakan lagi.`, "Ya, hapus akun")) {
    await act(() => api(`/api/users/${x.id}`, "DELETE"), "Akun berhasil dihapus.");
  }
}}
                            >
                              <Trash2 size={14} /> Hapus
                            </button>}
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
                        "Password berhasil diperbarui.",
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
                }, "Data barang berhasil diperbarui.");
              }}
            >
              <label className="block text-sm font-semibold">
                Nama Barang
                <input
                  autoFocus
                  required
                  maxLength={100}
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
    bulk_in: "Input Massal",
    edited: "Edit Barang",
    deleted: "Hapus Barang",
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
          {"Tidak ada riwayat yang cocok dengan pencarian atau filter."}
        </div>
      )}
    </div>
  );
}
