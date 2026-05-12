import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import "./App.css";
import { apiRequest } from "./lib/api";
import { API_BASE } from "./lib/config";
import { clearStoredSession, getStoredToken, getStoredUserName, setStoredSession } from "./lib/storage";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import type { LoginResponse } from "./types/auth";
import type { RecordItem } from "./types/record";

function App() {
  const [token, setToken] = useState<string | null>(() => getStoredToken());
  const [userName, setUserName] = useState<string>(() => getStoredUserName());
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [invoiceJson, setInvoiceJson] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const selected = useMemo(
    () => records.find((record) => record.id === selectedId) ?? null,
    [records, selectedId],
  );

  const loadRecords = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setMessage("");
    try {
      const data = await apiRequest<RecordItem[]>("/api/admin/records", token);
      setRecords(data);
      if (!selectedId && data.length > 0) {
        setSelectedId(data[0].id);
        setInvoiceJson(data[0].invoice ? JSON.stringify(data[0].invoice, null, 2) : "");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to load records");
    } finally {
      setLoading(false);
    }
  }, [token, selectedId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadRecords();
  }, [loadRecords]);

  async function onLogin(e: FormEvent) {
    e.preventDefault();
    setMessage("");
    setLoading(true);
    try {
      const result = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim().toLowerCase(), password }),
      });
      const body = (await result.json()) as Partial<LoginResponse> & { message?: string };
      if (!result.ok) {
        throw new Error(body.message || "Login gagal");
      }
      const role = String(body.user?.role ?? "");
      if (role !== "finance_admin" && role !== "buyers_admin") {
        throw new Error("Akun ini bukan admin.");
      }
      setStoredSession(body.token ?? "", body.user?.name ?? "");
      setToken(body.token ?? "");
      setUserName(body.user?.name ?? "");
      setUsername("");
      setPassword("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Login gagal");
    } finally {
      setLoading(false);
    }
  }

  function onLogout() {
    clearStoredSession();
    setToken(null);
    setUserName("");
    setRecords([]);
    setSelectedId(null);
  }

  async function updateSelected(patch: Partial<RecordItem>) {
    if (!selectedId) return;
    const updated = await apiRequest<RecordItem>(`/api/admin/records/${selectedId}`, token, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    setRecords((old) => old.map((record) => (record.id === selectedId ? updated : record)));
  }

  async function onSave() {
    if (!selected) return;
    setSaving(true);
    setMessage("");
    try {
      let parsedInvoice: unknown = null;
      if (invoiceJson.trim().length > 0) {
        parsedInvoice = JSON.parse(invoiceJson);
      }
      await updateSelected({ invoice: parsedInvoice });
      setMessage("Perubahan berhasil disimpan.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  }

  async function onToggleArchive() {
    if (!selected) return;
    const archived = !selected.archivedAt;
    setSaving(true);
    setMessage("");
    try {
      const updated = await apiRequest<RecordItem>(`/api/admin/records/${selected.id}/archive`, token, {
        method: "PATCH",
        body: JSON.stringify({ archived }),
      });
      setRecords((old) => old.map((item) => (item.id === selected.id ? updated : item)));
      setMessage(archived ? "Record diarsipkan." : "Archive dibuka kembali.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Gagal update archive");
    } finally {
      setSaving(false);
    }
  }

  async function onTogglePublish() {
    if (!selected) return;
    const published = !selected.publishedAt;
    setSaving(true);
    setMessage("");
    try {
      const updated = await apiRequest<RecordItem>(`/api/admin/records/${selected.id}/publish`, token, {
        method: "PATCH",
        body: JSON.stringify({ published }),
      });
      setRecords((old) => old.map((item) => (item.id === selected.id ? updated : item)));
      setMessage(published ? "Record dipublish ke history." : "Publish dibatalkan.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Gagal update publish");
    } finally {
      setSaving(false);
    }
  }

  async function onDeleteRecord() {
    if (!selected) return;
    const ok = window.confirm(`Hapus record ${selected.vendorCode} - ${selected.vendorName}?`);
    if (!ok) return;
    setSaving(true);
    setMessage("");
    try {
      await apiRequest<{ ok: boolean }>(`/api/admin/records/${selected.id}`, token, { method: "DELETE" });
      setRecords((old) => old.filter((item) => item.id !== selected.id));
      setSelectedId((prev) => {
        if (prev !== selected.id) return prev;
        const next = records.find((item) => item.id !== selected.id);
        setInvoiceJson(next?.invoice ? JSON.stringify(next.invoice, null, 2) : "");
        return next?.id ?? null;
      });
      setMessage("Record dihapus.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Gagal menghapus record");
    } finally {
      setSaving(false);
    }
  }

  if (!token) {
    return (
      <LoginPage
        username={username}
        password={password}
        loading={loading}
        message={message}
        onUsernameChange={setUsername}
        onPasswordChange={setPassword}
        onSubmit={onLogin}
      />
    );
  }

  return (
    <DashboardPage
      userName={userName}
      message={message}
      records={records}
      selectedId={selectedId}
      selected={selected}
      invoiceJson={invoiceJson}
      loading={loading}
      saving={saving}
      onRefresh={loadRecords}
      onLogout={onLogout}
      onSelect={(record) => {
        setSelectedId(record.id);
        setInvoiceJson(record.invoice ? JSON.stringify(record.invoice, null, 2) : "");
      }}
      onInvoiceJsonChange={setInvoiceJson}
      onPatch={updateSelected}
      onSave={onSave}
      onToggleArchive={onToggleArchive}
      onTogglePublish={onTogglePublish}
      onDelete={onDeleteRecord}
    />
  );
}

export default App;
