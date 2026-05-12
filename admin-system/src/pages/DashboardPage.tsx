import { RecordEditor } from "../components/RecordEditor";
import { RecordList } from "../components/RecordList";
import { API_BASE } from "../lib/config";
import type { RecordItem } from "../types/record";

type Props = {
  userName: string;
  message: string;
  records: RecordItem[];
  selectedId: string | null;
  selected: RecordItem | null;
  invoiceJson: string;
  loading: boolean;
  saving: boolean;
  onRefresh: () => void;
  onLogout: () => void;
  onSelect: (record: RecordItem) => void;
  onInvoiceJsonChange: (value: string) => void;
  onPatch: (patch: Partial<RecordItem>) => void;
  onSave: () => void;
  onToggleArchive: () => void;
  onTogglePublish: () => void;
  onDelete: () => void;
};

export function DashboardPage({
  userName,
  message,
  records,
  selectedId,
  selected,
  invoiceJson,
  loading,
  saving,
  onRefresh,
  onLogout,
  onSelect,
  onInvoiceJsonChange,
  onPatch,
  onSave,
  onToggleArchive,
  onTogglePublish,
  onDelete,
}: Props) {
  return (
    <main className="page dashboard-page">
      <header className="topbar">
        <div>
          <h1>Admin Dashboard</h1>
          <p>{userName || "Admin"} - backend: {API_BASE}</p>
        </div>
        <div className="row">
          <button onClick={onRefresh} disabled={loading}>
            Refresh
          </button>
          <button onClick={onLogout} className="ghost">
            Logout
          </button>
        </div>
      </header>

      {message && <p className="message">{message}</p>}

      <section className="layout">
        <RecordList records={records} selectedId={selectedId} loading={loading} onSelect={onSelect} />
        <RecordEditor
          selected={selected}
          saving={saving}
          invoiceJson={invoiceJson}
          onInvoiceJsonChange={onInvoiceJsonChange}
          onPatch={onPatch}
          onSave={onSave}
          onToggleArchive={onToggleArchive}
          onTogglePublish={onTogglePublish}
          onDelete={onDelete}
        />
      </section>
    </main>
  );
}
