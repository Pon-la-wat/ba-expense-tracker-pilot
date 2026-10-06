import { useState, type FormEvent } from "react";
import { validateEntry, type Entry } from "../shared/ledger";
import { ApiError, type EntryPayload } from "./api";

interface Props {
  entry?: Entry;
  defaultDate: string;
  onSave: (payload: EntryPayload) => Promise<void>;
  onCancel: () => void;
}

export function EntryForm({ entry, defaultDate, onSave, onCancel }: Props) {
  const [date, setDate] = useState(entry?.date ?? defaultDate);
  const [amount, setAmount] = useState(entry ? String(entry.amount) : "");
  const [type, setType] = useState<string>(entry?.type ?? "");
  const [note, setNote] = useState(entry?.note ?? "");
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const payload = { date, amount, type, note };
    const result = validateEntry(payload);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors([]);
    setSaving(true);
    try {
      await onSave(payload);
    } catch (error) {
      setErrors(
        error instanceof ApiError && error.details.length > 0 ? error.details : [errorText(error)],
      );
      setSaving(false);
    }
  }

  return (
    <form className="card" onSubmit={submit} noValidate>
      <h2>{entry ? "แก้ไขรายการ" : "เพิ่มรายการใหม่"}</h2>
      {errors.length > 0 && (
        <div role="alert" className="error">
          <p>กรุณาแก้ไขก่อนบันทึก:</p>
          <ul>
            {errors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      )}
      <label>
        วันที่
        <input type="date" value={date} onChange={(event) => setDate(event.target.value)} autoFocus />
      </label>
      <label>
        จำนวนเงิน (บาท)
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
      </label>
      <fieldset>
        <legend>ประเภท</legend>
        <label className="choice">
          <input
            type="radio"
            name="type"
            value="income"
            checked={type === "income"}
            onChange={() => setType("income")}
          />
          รายรับ
        </label>
        <label className="choice">
          <input
            type="radio"
            name="type"
            value="expense"
            checked={type === "expense"}
            onChange={() => setType("expense")}
          />
          รายจ่าย
        </label>
      </fieldset>
      <label>
        หมายเหตุ
        <input
          type="text"
          autoComplete="off"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>
      <div className="actions">
        <button type="submit" className="primary" disabled={saving}>
          {entry ? "บันทึกการแก้ไข" : "บันทึกรายการ"}
        </button>
        <button type="button" onClick={onCancel} disabled={saving}>
          ยกเลิก
        </button>
      </div>
    </form>
  );
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง";
}
