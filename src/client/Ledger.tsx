import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  TYPE_LABEL,
  currentMonth,
  filterEntries,
  formatBaht,
  formatDate,
  formatMonth,
  monthOf,
  shiftMonth,
  summarize,
  type Entry,
  type Filter,
} from "../shared/ledger";
import { Api, ApiError, type EntryPayload } from "./api";
import { EntryForm } from "./EntryForm";
import { Page } from "./Page";

type Form = { entry?: Entry } | null;

interface Props {
  api: Api;
  onLogout: () => void;
  onExpired: () => void;
}

const MONTHS_BACK = 12;

export function Ledger({ api, onLogout, onExpired }: Props) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [month, setMonth] = useState(currentMonth);
  const [search, setSearch] = useState("");
  const [type, setType] = useState<Filter["type"]>("all");
  const [order, setOrder] = useState<Filter["order"]>("desc");
  const [form, setForm] = useState<Form>(null);
  const [deleting, setDeleting] = useState<Entry | null>(null);
  const [message, setMessage] = useState("");
  const [actionError, setActionError] = useState("");

  const addButton = useRef<HTMLButtonElement>(null);
  const opener = useRef<Element | null>(null);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      setEntries(await api.listEntries());
      setStatus("ready");
    } catch (error) {
      if (error instanceof ApiError && error.kind === "auth") return onExpired();
      setLoadError(error instanceof Error ? error.message : "เกิดข้อผิดพลาด");
      setStatus("error");
    }
  }, [api, onExpired]);

  useEffect(() => {
    void load();
  }, [load]);

  function returnFocus() {
    const target = opener.current;
    opener.current = null;
    setTimeout(() => {
      if (target instanceof HTMLElement && target.isConnected) target.focus();
      else addButton.current?.focus();
    });
  }

  function openForm(next: Form) {
    opener.current = document.activeElement;
    setMessage("");
    setForm(next);
  }

  async function guard(action: () => Promise<void>) {
    try {
      await action();
    } catch (error) {
      if (error instanceof ApiError && error.kind === "auth") return onExpired();
      throw error;
    }
  }

  const save = (payload: EntryPayload) =>
    guard(async () => {
      const editing = form?.entry;
      const saved = editing
        ? await api.updateEntry(editing.id, payload)
        : await api.createEntry(payload);
      setEntries((current) =>
        editing
          ? current.map((entry) => (entry.id === saved.id ? saved : entry))
          : [...current, saved],
      );
      setMonth(monthOf(saved.date));
      setMessage(editing ? "แก้ไขรายการแล้ว" : "บันทึกรายการแล้ว");
      setForm(null);
      returnFocus();
    });

  async function confirmDelete() {
    if (!deleting) return;
    setActionError("");
    try {
      await guard(async () => {
        await api.deleteEntry(deleting.id);
        setEntries((current) => current.filter((entry) => entry.id !== deleting.id));
        setMessage("ลบรายการแล้ว");
        setDeleting(null);
        returnFocus();
      });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "ลบไม่สำเร็จ");
    }
  }

  const months = useMemo(() => {
    const now = currentMonth();
    const set = new Set([month, ...entries.map((entry) => monthOf(entry.date))]);
    for (let back = 0; back <= MONTHS_BACK; back += 1) set.add(shiftMonth(now, -back));
    return [...set].sort().reverse();
  }, [entries, month]);

  const summary = summarize(entries, month);
  const monthEntries = entries.filter((entry) => monthOf(entry.date) === month);
  const shown = filterEntries(entries, { month, search, type, order });

  return (
    <Page title="บัญชีรายรับรายจ่าย">
      <div className="toolbar">
        <label>
          เดือนที่ดู
          <select value={month} onChange={(event) => setMonth(event.target.value)}>
            {months.map((value) => (
              <option key={value} value={value}>
                {formatMonth(value)}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={onLogout}>
          ออกจากระบบ
        </button>
      </div>

      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}

      {status === "loading" && <p role="status">กำลังโหลดข้อมูล…</p>}

      {status === "error" && (
        <div role="alert" className="error">
          <p>{loadError}</p>
          <button type="button" onClick={() => void load()}>
            ลองอีกครั้ง
          </button>
        </div>
      )}

      {status === "ready" && (
        <>
          <section aria-labelledby="summary-title" className="card">
            <h2 id="summary-title">สรุปยอดเดือน {formatMonth(month)}</h2>
            <dl className="summary">
              <div>
                <dt>รวมรายรับ</dt>
                <dd className="income">{formatBaht(summary.income)}</dd>
              </div>
              <div>
                <dt>รวมรายจ่าย</dt>
                <dd className="expense">{formatBaht(summary.expense)}</dd>
              </div>
              <div>
                <dt>ยอดคงเหลือ</dt>
                <dd>{formatBaht(summary.balance)}</dd>
              </div>
            </dl>
          </section>

          {form ? (
            <EntryForm
              key={form.entry?.id ?? "new"}
              entry={form.entry}
              defaultDate={todayIn(month)}
              onSave={save}
              onCancel={() => {
                setForm(null);
                returnFocus();
              }}
            />
          ) : (
            <button
              type="button"
              className="primary"
              ref={addButton}
              onClick={() => openForm({})}
            >
              เพิ่มรายการ
            </button>
          )}

          <section aria-labelledby="list-title">
            <h2 id="list-title">รายการ</h2>
            <div className="toolbar">
              <label>
                ค้นหาจากหมายเหตุ
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              <label>
                แสดงประเภท
                <select
                  value={type}
                  onChange={(event) => setType(event.target.value as Filter["type"])}
                >
                  <option value="all">ทั้งหมด</option>
                  <option value="income">{TYPE_LABEL.income}</option>
                  <option value="expense">{TYPE_LABEL.expense}</option>
                </select>
              </label>
              <label>
                เรียงตามวันที่
                <select
                  value={order}
                  onChange={(event) => setOrder(event.target.value as Filter["order"])}
                >
                  <option value="desc">ใหม่ไปเก่า</option>
                  <option value="asc">เก่าไปใหม่</option>
                </select>
              </label>
            </div>

            {monthEntries.length === 0 ? (
              <p>ยังไม่มีรายการในเดือนนี้ เริ่มจดได้โดยกดปุ่ม “เพิ่มรายการ”</p>
            ) : shown.length === 0 ? (
              <p>ไม่พบรายการที่ตรงกับคำค้นหาหรือตัวกรอง</p>
            ) : (
              <ul className="entries">
                {shown.map((entry) => {
                  const label = `${entry.note || "ไม่มีหมายเหตุ"} วันที่ ${formatDate(entry.date)}`;
                  return (
                    <li key={entry.id} className="card">
                      <div className="entry-main">
                        <span>{formatDate(entry.date)}</span>
                        <strong>{entry.note || "(ไม่มีหมายเหตุ)"}</strong>
                      </div>
                      <div className={`amount ${entry.type}`}>
                        {TYPE_LABEL[entry.type]} {formatBaht(entry.amount)}
                      </div>
                      <div className="actions">
                        <button
                          type="button"
                          aria-label={`แก้ไขรายการ ${label}`}
                          onClick={() => openForm({ entry })}
                        >
                          แก้ไข
                        </button>
                        <button
                          type="button"
                          aria-label={`ลบรายการ ${label}`}
                          onClick={() => {
                            opener.current = document.activeElement;
                            setActionError("");
                            setMessage("");
                            setDeleting(entry);
                          }}
                        >
                          ลบ
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}

      {deleting && (
        <div className="overlay">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            className="card dialog"
          >
            <h2 id="confirm-title">ยืนยันการลบรายการ</h2>
            <p>
              ต้องการลบรายการ “{deleting.note || "ไม่มีหมายเหตุ"}” จำนวน{" "}
              {formatBaht(deleting.amount)} ใช่หรือไม่?
            </p>
            {actionError && (
              <p role="alert" className="error">
                {actionError}
              </p>
            )}
            <div className="actions">
              <button
                type="button"
                autoFocus
                onClick={() => {
                  setDeleting(null);
                  returnFocus();
                }}
              >
                ยกเลิก
              </button>
              <button type="button" className="danger" onClick={() => void confirmDelete()}>
                ยืนยันลบ
              </button>
            </div>
          </div>
        </div>
      )}
    </Page>
  );
}

/** Today when the viewed month is this month, otherwise the first day of the viewed month. */
function todayIn(month: string): string {
  const now = new Date();
  const today = `${currentMonth()}-${String(now.getDate()).padStart(2, "0")}`;
  return month === currentMonth() ? today : `${month}-01`;
}
