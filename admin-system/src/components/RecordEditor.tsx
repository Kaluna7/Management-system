import type { RecordItem } from "../types/record";

type Props = {
  selected: RecordItem | null;
  saving: boolean;
  invoiceJson: string;
  onInvoiceJsonChange: (value: string) => void;
  onPatch: (patch: Partial<RecordItem>) => void;
  onSave: () => void;
  onToggleArchive: () => void;
  onTogglePublish: () => void;
  onDelete: () => void;
};

function toInputDate(value?: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function toIsoOrNull(value: string) {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function RecordEditor({
  selected,
  saving,
  invoiceJson,
  onInvoiceJsonChange,
  onPatch,
  onSave,
  onToggleArchive,
  onTogglePublish,
  onDelete,
}: Props) {
  return (
    <section className="card detail-panel">
      {!selected ? (
        <p>Pilih record untuk edit.</p>
      ) : (
        <>
          <h2>Edit Record</h2>
          <div className="form-grid">
            <label>
              Vendor Code
              <input value={selected.vendorCode} onChange={(e) => onPatch({ vendorCode: e.target.value })} />
            </label>
            <label>
              Vendor Name
              <input value={selected.vendorName} onChange={(e) => onPatch({ vendorName: e.target.value })} />
            </label>
            <label>
              Income Type
              <input value={selected.incomeType} onChange={(e) => onPatch({ incomeType: e.target.value })} />
            </label>
            <label>
              Amount
              <input
                type="number"
                value={selected.amount}
                onChange={(e) => onPatch({ amount: Number(e.target.value) })}
              />
            </label>
            <label>
              Period Start
              <input
                type="date"
                value={toInputDate(selected.periodStart)}
                onChange={(e) => onPatch({ periodStart: toIsoOrNull(e.target.value) ?? "" })}
              />
            </label>
            <label>
              Period End
              <input
                type="date"
                value={toInputDate(selected.periodEnd)}
                onChange={(e) => onPatch({ periodEnd: toIsoOrNull(e.target.value) ?? "" })}
              />
            </label>
            <label>
              Agreement File Name
              <input
                value={selected.agreementFileName}
                onChange={(e) => onPatch({ agreementFileName: e.target.value })}
              />
            </label>
            <label>
              Status
              <input value={selected.status} onChange={(e) => onPatch({ status: e.target.value })} />
            </label>
            <label className="span-2">
              Description
              <textarea
                value={selected.description}
                onChange={(e) => onPatch({ description: e.target.value })}
                rows={3}
              />
            </label>
            <label>
              Invoice Received
              <select
                value={String(selected.invoiceReceived)}
                onChange={(e) => onPatch({ invoiceReceived: e.target.value === "true" })}
              >
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            </label>
            <label>
              Stamped Paper
              <input
                value={selected.stampedPaperFileName ?? ""}
                onChange={(e) => onPatch({ stampedPaperFileName: e.target.value })}
              />
            </label>
            <label className="span-2">
              Invoice JSON
              <textarea
                value={invoiceJson}
                onChange={(e) => onInvoiceJsonChange(e.target.value)}
                placeholder='{"number":"INV-001"}'
                rows={5}
              />
            </label>
          </div>

          <div className="actions">
            <button onClick={onSave} disabled={saving}>
              Save
            </button>
            <button onClick={onToggleArchive} disabled={saving} className="warn">
              {selected.archivedAt ? "Unarchive" : "Archive"}
            </button>
            <button onClick={onTogglePublish} disabled={saving} className="warn">
              {selected.publishedAt ? "Unpublish" : "Publish"}
            </button>
            <button onClick={onDelete} disabled={saving} className="danger">
              Delete
            </button>
          </div>
        </>
      )}
    </section>
  );
}
