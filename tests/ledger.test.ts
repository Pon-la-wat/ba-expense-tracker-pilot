import { describe, expect, it } from "vitest";
import {
  filterEntries,
  shiftMonth,
  summarize,
  validateEntry,
  type Entry,
} from "../src/shared/ledger";

function entry(id: string, date: string, amount: number, type: Entry["type"], note = ""): Entry {
  return { id, date, amount, type, note };
}

describe("ledger rules", () => {
  it("[EX-1] an expense of 150 on the 3rd is valid and adds 150 to that month's expenses", () => {
    const result = validateEntry({ date: "2026-10-03", amount: "150", type: "expense", note: "ค่าอาหาร" });
    expect(result).toEqual({
      ok: true,
      value: { date: "2026-10-03", amount: 150, type: "expense", note: "ค่าอาหาร" },
    });
    const before = summarize([], "2026-10");
    const after = summarize([entry("1", "2026-10-03", 150, "expense", "ค่าอาหาร")], "2026-10");
    expect(after.expense - before.expense).toBe(150);
  });

  it("[EX-2] changing an amount changes the month's totals", () => {
    const wrong = [entry("1", "2026-10-05", 1500, "income"), entry("2", "2026-10-06", 20, "expense")];
    const fixed = [entry("1", "2026-10-05", 150, "income"), entry("2", "2026-10-06", 20, "expense")];
    expect(summarize(wrong, "2026-10").balance).toBe(1480);
    expect(summarize(fixed, "2026-10").balance).toBe(130);
  });

  it("[EX-4] an amount of 0, a missing type, a missing date and non-numbers are refused with a clear message", () => {
    const zero = validateEntry({ date: "2026-10-03", amount: "0", type: "expense", note: "" });
    expect(zero).toEqual({ ok: false, errors: ["จำนวนเงินต้องมากกว่า 0"] });

    const noType = validateEntry({ date: "2026-10-03", amount: "10", type: "", note: "" });
    expect(noType).toEqual({ ok: false, errors: ["กรุณาเลือกประเภท (รายรับหรือรายจ่าย)"] });

    const nothing = validateEntry({});
    expect(nothing).toEqual({
      ok: false,
      errors: ["กรุณาเลือกวันที่", "กรุณาใส่จำนวนเงิน", "กรุณาเลือกประเภท (รายรับหรือรายจ่าย)"],
    });

    const words = validateEntry({ date: "2026-10-03", amount: "สิบ", type: "income", note: "" });
    expect(words).toEqual({ ok: false, errors: ["จำนวนเงินต้องเป็นตัวเลข"] });

    const negative = validateEntry({ date: "2026-10-03", amount: "-5", type: "income", note: "" });
    expect(negative.ok).toBe(false);

    const badDate = validateEntry({ date: "2026-02-31", amount: "5", type: "income", note: "" });
    expect(badDate).toEqual({ ok: false, errors: ["วันที่ไม่ถูกต้อง"] });
  });

  it("[EX-5] search matches only the note, and the type and month filters narrow it", () => {
    const entries = [
      entry("1", "2026-10-03", 150, "expense", "ค่าอาหาร"),
      entry("2", "2026-10-04", 50, "income", "ได้คืนค่าอาหาร"),
      entry("3", "2026-10-05", 30, "expense", "ค่าเดินทาง"),
      entry("4", "2026-09-05", 90, "expense", "ค่าอาหาร"),
    ];
    const base = { month: "2026-10", search: "", type: "all", order: "asc" } as const;
    expect(filterEntries(entries, { ...base, search: "ค่าอาหาร" }).map((e) => e.id)).toEqual(["1", "2"]);
    expect(
      filterEntries(entries, { ...base, search: "ค่าอาหาร", type: "expense" }).map((e) => e.id),
    ).toEqual(["1"]);
    expect(filterEntries(entries, { ...base, month: "2026-09", search: "ค่าอาหาร" }).map((e) => e.id)).toEqual(["4"]);
    expect(filterEntries(entries, { ...base, order: "desc" }).map((e) => e.date)).toEqual([
      "2026-10-05",
      "2026-10-04",
      "2026-10-03",
    ]);
  });

  it("[EX-6] a month's totals leave out every other month, and the previous month is reachable", () => {
    const entries = [
      entry("1", "2026-09-10", 1000, "income"),
      entry("2", "2026-10-02", 500, "income"),
      entry("3", "2026-10-03", 200, "expense"),
    ];
    expect(summarize(entries, "2026-10")).toEqual({ income: 500, expense: 200, balance: 300 });
    expect(summarize(entries, shiftMonth("2026-10", -1))).toEqual({
      income: 1000,
      expense: 0,
      balance: 1000,
    });
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });

  it("[EX-11] a month copied from the notebook gives the same income, expense and balance", () => {
    const notebook = [
      entry("1", "2026-08-01", 25000.5, "income", "เงินเดือน"),
      entry("2", "2026-08-02", 0.1, "expense"),
      entry("3", "2026-08-03", 0.2, "expense"),
      entry("4", "2026-08-15", 3499.9, "expense", "ค่าเช่า"),
      entry("5", "2026-08-20", 1200, "income", "ขายของ"),
      entry("6", "2026-07-31", 99999, "income", "เดือนก่อน"),
    ];
    // Hand-calculated in the notebook: 26200.50 in, 3500.20 out, 22700.30 left.
    expect(summarize(notebook, "2026-08")).toEqual({
      income: 26200.5,
      expense: 3500.2,
      balance: 22700.3,
    });
  });
});
