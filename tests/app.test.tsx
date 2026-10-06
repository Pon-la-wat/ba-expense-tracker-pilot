import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "../src/client/App";
import { currentMonth, shiftMonth } from "../src/shared/ledger";
import { OWNER, startApp, type TestApp } from "./helpers";

let server: TestApp;
beforeEach(async () => {
  server = await startApp();
});
afterEach(async () => {
  cleanup();
  await server.close();
});

async function openApp(baseUrl = server.url) {
  const user = userEvent.setup();
  render(<App baseUrl={baseUrl} />);
  await user.type(screen.getByLabelText("อีเมล"), OWNER.email);
  await user.type(screen.getByLabelText("รหัสผ่าน"), OWNER.password);
  await user.click(screen.getByRole("button", { name: "เข้าสู่ระบบ" }));
  return user;
}

async function ready() {
  await screen.findByRole("heading", { name: /สรุปยอดเดือน/ });
}

async function fillForm(
  user: ReturnType<typeof userEvent.setup>,
  values: { date: string; amount: string; type?: "รายรับ" | "รายจ่าย"; note: string },
) {
  fireEvent.change(screen.getByLabelText("วันที่"), { target: { value: values.date } });
  const amount = screen.getByLabelText("จำนวนเงิน (บาท)");
  await user.clear(amount);
  if (values.amount) await user.type(amount, values.amount);
  if (values.type) await user.click(screen.getByLabelText(values.type));
  const note = screen.getByLabelText("หมายเหตุ");
  await user.clear(note);
  if (values.note) await user.type(note, values.note);
}

async function add(
  user: ReturnType<typeof userEvent.setup>,
  values: Parameters<typeof fillForm>[1],
) {
  await user.click(screen.getByRole("button", { name: "เพิ่มรายการ" }));
  await fillForm(user, values);
  await user.click(screen.getByRole("button", { name: "บันทึกรายการ" }));
}

function summary() {
  const region = screen.getByRole("region", { name: /สรุปยอดเดือน/ });
  const value = (name: string) => within(region).getByText(name).nextElementSibling?.textContent;
  return { income: value("รวมรายรับ"), expense: value("รวมรายจ่าย"), balance: value("ยอดคงเหลือ") };
}

const thisMonth = currentMonth();

describe("screens", () => {
  it("[EX-1] a 150 baht expense on the 3rd appears in the list and raises the month's expenses by 150", async () => {
    const user = await openApp();
    await ready();
    expect(summary().expense).toBe("0.00 บาท");
    await add(user, { date: `${thisMonth}-03`, amount: "150", type: "รายจ่าย", note: "ค่าอาหาร" });
    const item = (await screen.findByText("ค่าอาหาร")).closest("li") as HTMLElement;
    expect(within(item).getByText(/รายจ่าย 150.00 บาท/)).toBeTruthy();
    expect(summary().expense).toBe("150.00 บาท");
    expect(summary().balance).toBe("-150.00 บาท");
  });

  it("[EX-2] correcting a wrong amount changes the month's totals at once", async () => {
    const user = await openApp();
    await ready();
    await add(user, { date: `${thisMonth}-05`, amount: "1500", type: "รายรับ", note: "เงินพิเศษ" });
    await screen.findByText("เงินพิเศษ");
    expect(summary().income).toBe("1,500.00 บาท");
    await user.click(screen.getByRole("button", { name: /^แก้ไขรายการ เงินพิเศษ/ }));
    await fillForm(user, { date: `${thisMonth}-05`, amount: "150", note: "เงินพิเศษ" });
    await user.click(screen.getByRole("button", { name: "บันทึกการแก้ไข" }));
    await screen.findByText("แก้ไขรายการแล้ว");
    expect(summary().income).toBe("150.00 บาท");
    expect(summary().balance).toBe("150.00 บาท");
  });

  it("[EX-3] delete asks first, cancel keeps the entry, confirm removes it", async () => {
    const user = await openApp();
    await ready();
    await add(user, { date: `${thisMonth}-03`, amount: "80", type: "รายจ่าย", note: "กาแฟ" });
    await screen.findByText("กาแฟ");
    await user.click(screen.getByRole("button", { name: /^ลบรายการ กาแฟ/ }));
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText(/ต้องการลบรายการ/)).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "ยกเลิก" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByText("กาแฟ")).toBeTruthy();
    expect(summary().expense).toBe("80.00 บาท");

    await user.click(screen.getByRole("button", { name: /^ลบรายการ กาแฟ/ }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "ยืนยันลบ" }));
    await waitFor(() => expect(screen.queryByText("กาแฟ")).toBeNull());
    expect(summary().expense).toBe("0.00 บาท");
  });

  it("[EX-4] an amount of 0 or a missing type is not saved and the screen says what to fix", async () => {
    const user = await openApp();
    await ready();
    await add(user, { date: `${thisMonth}-03`, amount: "0", type: "รายจ่าย", note: "ศูนย์" });
    expect(within(screen.getByRole("alert")).getByText("จำนวนเงินต้องมากกว่า 0")).toBeTruthy();

    // A fresh form, because the earlier one still remembers the type that was chosen.
    await user.click(screen.getByRole("button", { name: "ยกเลิก" }));
    await user.click(screen.getByRole("button", { name: "เพิ่มรายการ" }));
    await fillForm(user, { date: `${thisMonth}-03`, amount: "50", note: "ไม่เลือกประเภท" });
    await user.click(screen.getByRole("button", { name: "บันทึกรายการ" }));
    expect(within(screen.getByRole("alert")).getByText("กรุณาเลือกประเภท (รายรับหรือรายจ่าย)")).toBeTruthy();
    expect(server.store.list()).toEqual([]);
  });

  it("[EX-5] searching a note shows only matching entries, and the type filter narrows the month", async () => {
    const user = await openApp();
    await ready();
    await add(user, { date: `${thisMonth}-03`, amount: "150", type: "รายจ่าย", note: "ค่าอาหาร" });
    await screen.findByText("ค่าอาหาร");
    await add(user, { date: `${thisMonth}-04`, amount: "60", type: "รายรับ", note: "คืนค่าอาหาร" });
    await screen.findByText("คืนค่าอาหาร");
    await add(user, { date: `${thisMonth}-05`, amount: "30", type: "รายจ่าย", note: "ค่าเดินทาง" });
    await screen.findByText("ค่าเดินทาง");

    await user.type(screen.getByLabelText("ค้นหาจากหมายเหตุ"), "ค่าอาหาร");
    expect(screen.queryByText("ค่าเดินทาง")).toBeNull();
    expect(screen.getByText("ค่าอาหาร")).toBeTruthy();
    expect(screen.getByText("คืนค่าอาหาร")).toBeTruthy();

    await user.selectOptions(screen.getByLabelText("แสดงประเภท"), "expense");
    expect(screen.queryByText("คืนค่าอาหาร")).toBeNull();
    expect(screen.getByText("ค่าอาหาร")).toBeTruthy();

    await user.selectOptions(screen.getByLabelText("เรียงตามวันที่"), "asc");
    await user.clear(screen.getByLabelText("ค้นหาจากหมายเหตุ"));
    const notes = screen.getAllByRole("listitem").map((li) => li.querySelector("strong")?.textContent);
    expect(notes).toEqual(["ค่าอาหาร", "ค่าเดินทาง"]);
  });

  it("[EX-6] the home page shows this month's totals and the previous month can be picked", async () => {
    const user = await openApp();
    await ready();
    const previous = shiftMonth(thisMonth, -1);
    await add(user, { date: `${previous}-10`, amount: "1000", type: "รายรับ", note: "เดือนก่อน" });
    await screen.findByText("เดือนก่อน");
    await add(user, { date: `${thisMonth}-02`, amount: "500", type: "รายรับ", note: "เดือนนี้" });
    await screen.findByText("เดือนนี้");
    await add(user, { date: `${thisMonth}-03`, amount: "200", type: "รายจ่าย", note: "จ่ายเดือนนี้" });
    await screen.findByText("จ่ายเดือนนี้");
    expect(summary()).toEqual({ income: "500.00 บาท", expense: "200.00 บาท", balance: "300.00 บาท" });

    await user.selectOptions(screen.getByLabelText("เดือนที่ดู"), previous);
    expect(summary()).toEqual({ income: "1,000.00 บาท", expense: "0.00 บาท", balance: "1,000.00 บาท" });
  });

  it("[EX-6] a new session opens on the current month", async () => {
    await openApp();
    await ready();
    expect((screen.getByLabelText("เดือนที่ดู") as HTMLSelectElement).value).toBe(thisMonth);
  });

  it("[EX-7] says the connection failed instead of showing a blank page, and offers a retry", async () => {
    const user = await openApp();
    await ready();
    cleanup();
    const closed = server.url;
    await server.close();
    render(<App baseUrl={closed} />);
    await user.type(screen.getByLabelText("อีเมล"), OWNER.email);
    await user.type(screen.getByLabelText("รหัสผ่าน"), OWNER.password);
    await user.click(screen.getByRole("button", { name: "เข้าสู่ระบบ" }));
    expect((await screen.findByRole("alert")).textContent).toContain("เชื่อมต่ออินเทอร์เน็ตไม่ได้");
    server = await startApp();
  });

  it("[EX-7] shows a loading status while entries load and a guide when there are none", async () => {
    await openApp();
    expect(await screen.findByText("กำลังโหลดข้อมูล…")).toBeTruthy();
    await ready();
    expect(screen.queryByText("กำลังโหลดข้อมูล…")).toBeNull();
    expect(screen.getByText(/ยังไม่มีรายการในเดือนนี้/)).toBeTruthy();
  });

  it("[EX-7] a failing entries request shows an error with a retry that recovers", async () => {
    const user = userEvent.setup();
    render(<App baseUrl={server.url} />);
    await user.type(screen.getByLabelText("อีเมล"), OWNER.email);
    await user.type(screen.getByLabelText("รหัสผ่าน"), OWNER.password);
    const realFetch = globalThis.fetch;
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
      String(input).endsWith("/api/entries") && init?.method === "GET"
        ? Promise.reject(new TypeError("offline"))
        : realFetch(input, init)) as typeof fetch;
    try {
      await user.click(screen.getByRole("button", { name: "เข้าสู่ระบบ" }));
      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toContain("เชื่อมต่ออินเทอร์เน็ตไม่ได้");
    } finally {
      globalThis.fetch = realFetch;
    }
    await user.click(screen.getByRole("button", { name: "ลองอีกครั้ง" }));
    await ready();
  });

  it("[EX-8] asks for the password before any data, and the forgot screen sends the link to the registered email", async () => {
    const user = userEvent.setup();
    render(<App baseUrl={server.url} />);
    expect(screen.getByRole("heading", { name: "เข้าสู่ระบบ" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /สรุปยอดเดือน/ })).toBeNull();

    await user.type(screen.getByLabelText("อีเมล"), OWNER.email);
    await user.type(screen.getByLabelText("รหัสผ่าน"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "เข้าสู่ระบบ" }));
    expect((await screen.findByRole("alert")).textContent).toContain("อีเมลหรือรหัสผ่านไม่ถูกต้อง");

    await user.click(screen.getByRole("button", { name: "ลืมรหัสผ่าน" }));
    await user.click(screen.getByRole("button", { name: "ส่งลิงก์ไปที่อีเมล" }));
    expect((await screen.findByRole("status")).textContent).toContain("อีเมลที่ลงทะเบียนไว้");
    expect(server.mails).toHaveLength(1);
    expect(server.mails[0]?.to).toBe(OWNER.email);
  });

  it("[EX-9] what one device saves, a second device shows", async () => {
    const phone = await openApp();
    await ready();
    await add(phone, { date: `${thisMonth}-03`, amount: "150", type: "รายจ่าย", note: "จากโทรศัพท์" });
    await screen.findByText("จากโทรศัพท์");
    cleanup();

    await openApp();
    expect(await screen.findByText("จากโทรศัพท์")).toBeTruthy();
    expect(summary().expense).toBe("150.00 บาท");
  });

  it("[EX-10] every screen is written in Thai", async () => {
    const user = userEvent.setup();
    render(<App baseUrl={server.url} />);
    const latin = /[A-Za-z]{2,}/;
    expect(document.body.textContent).not.toMatch(latin);
    await user.click(screen.getByRole("button", { name: "ลืมรหัสผ่าน" }));
    expect(document.body.textContent).not.toMatch(latin);
    await user.click(screen.getByRole("button", { name: "กลับไปหน้าเข้าสู่ระบบ" }));
    await user.type(screen.getByLabelText("อีเมล"), OWNER.email);
    await user.type(screen.getByLabelText("รหัสผ่าน"), OWNER.password);
    await user.click(screen.getByRole("button", { name: "เข้าสู่ระบบ" }));
    await ready();
    await user.click(screen.getByRole("button", { name: "เพิ่มรายการ" }));
    expect(document.body.textContent).not.toMatch(latin);
  });
});
