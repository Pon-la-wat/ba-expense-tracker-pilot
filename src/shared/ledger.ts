export type EntryType = "income" | "expense";

export interface Entry {
  id: string;
  /** Calendar date, `YYYY-MM-DD`. */
  date: string;
  /** Baht, at most two decimals, always greater than 0. */
  amount: number;
  type: EntryType;
  note: string;
}

export type EntryValues = Omit<Entry, "id">;

export type Validation =
  | { ok: true; value: EntryValues }
  | { ok: false; errors: string[] };

export interface Summary {
  income: number;
  expense: number;
  balance: number;
}

export interface Filter {
  month: string;
  search: string;
  type: EntryType | "all";
  order: "asc" | "desc";
}

export const NOTE_MAX_LENGTH = 100;

export const TYPE_LABEL: Record<EntryType, string> = {
  income: "รายรับ",
  expense: "รายจ่าย",
};

function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function parseAmount(raw: unknown): { amount?: number; error?: string } {
  const text = (typeof raw === "number" ? String(raw) : typeof raw === "string" ? raw : "")
    .replace(/[,\s]/g, "");
  if (text === "") return { error: "กรุณาใส่จำนวนเงิน" };
  if (!/^(\d+\.?\d*|\.\d+)$/.test(text)) return { error: "จำนวนเงินต้องเป็นตัวเลข" };
  const amount = Math.round(Number(text) * 100) / 100;
  if (amount <= 0) return { error: "จำนวนเงินต้องมากกว่า 0" };
  if (amount > 1e12) return { error: "จำนวนเงินมากเกินไป" };
  return { amount };
}

/** Checks one entry before it is saved; every message is shown to the user as is. */
export function validateEntry(input: {
  date?: unknown;
  amount?: unknown;
  type?: unknown;
  note?: unknown;
}): Validation {
  const errors: string[] = [];

  const date = typeof input.date === "string" ? input.date.trim() : "";
  if (date === "") errors.push("กรุณาเลือกวันที่");
  else if (!isRealDate(date)) errors.push("วันที่ไม่ถูกต้อง");

  const { amount, error } = parseAmount(input.amount);
  if (error) errors.push(error);

  if (input.type !== "income" && input.type !== "expense") {
    errors.push("กรุณาเลือกประเภท (รายรับหรือรายจ่าย)");
  }

  const note = typeof input.note === "string" ? input.note.trim() : "";
  if (note.length > NOTE_MAX_LENGTH) {
    errors.push(`หมายเหตุต้องไม่เกิน ${NOTE_MAX_LENGTH} ตัวอักษร`);
  }

  if (errors.length > 0 || amount === undefined) return { ok: false, errors };
  return { ok: true, value: { date, amount, type: input.type as EntryType, note } };
}

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function currentMonth(): string {
  return monthKey(new Date());
}

/** The month `offset` months from `month` (negative = earlier). */
export function shiftMonth(month: string, offset: number): string {
  const [year, number] = month.split("-").map(Number) as [number, number];
  return monthKey(new Date(year, number - 1 + offset, 1));
}

/** Totals for one month only: earlier months never carry over. Works in satang to avoid float drift. */
export function summarize(entries: readonly Entry[], month: string): Summary {
  let income = 0;
  let expense = 0;
  for (const entry of entries) {
    if (monthOf(entry.date) !== month) continue;
    const satang = Math.round(entry.amount * 100);
    if (entry.type === "income") income += satang;
    else expense += satang;
  }
  return { income: income / 100, expense: expense / 100, balance: (income - expense) / 100 };
}

export function filterEntries(entries: readonly Entry[], filter: Filter): Entry[] {
  const search = filter.search.trim().toLowerCase();
  const matches = entries.filter(
    (entry) =>
      monthOf(entry.date) === filter.month &&
      (filter.type === "all" || entry.type === filter.type) &&
      (search === "" || entry.note.toLowerCase().includes(search)),
  );
  const sign = filter.order === "asc" ? 1 : -1;
  return matches.sort((a, b) => sign * a.date.localeCompare(b.date));
}

export function formatBaht(amount: number): string {
  return `${amount.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} บาท`;
}

export function formatMonth(month: string): string {
  const [year, number] = month.split("-").map(Number) as [number, number];
  return new Date(year, number - 1, 1).toLocaleDateString("th-TH", {
    month: "long",
    year: "numeric",
  });
}

export function formatDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
