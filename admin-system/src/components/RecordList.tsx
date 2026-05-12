import type { RecordItem } from "../types/record";

type Props = {
  records: RecordItem[];
  selectedId: string | null;
  loading: boolean;
  onSelect: (record: RecordItem) => void;
};

export function RecordList({ records, selectedId, loading, onSelect }: Props) {
  return (
    <aside className="card list-panel">
      <h2>Records ({records.length})</h2>
      {loading ? (
        <p>Loading...</p>
      ) : (
        <ul className="record-list">
          {records.map((record) => (
            <li key={record.id}>
              <button
                className={record.id === selectedId ? "active" : ""}
                onClick={() => onSelect(record)}
              >
                <strong>{record.vendorCode}</strong> - {record.vendorName}
                <small>
                  {record.status} | {new Date(record.createdAt).toLocaleDateString()}
                </small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
