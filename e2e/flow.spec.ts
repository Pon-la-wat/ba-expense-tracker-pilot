import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const OWNER = { email: "owner@example.com", password: "correct-horse" };

/** The month `back` months before this one as `YYYY-MM`; each test owns one month so totals stay independent. */
function monthBack(back: number): string {
  const date = new Date();
  const shifted = new Date(date.getFullYear(), date.getMonth() - back, 1);
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, "0")}`;
}

async function scan(page: Page) {
  const result = await new AxeBuilder({ page }).analyze();
  const serious = result.violations.filter(
    (violation) => violation.impact === "serious" || violation.impact === "critical",
  );
  expect(serious.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
}

async function typeInto(page: Page, label: string, text: string) {
  await page.getByLabel(label, { exact: true }).focus();
  await page.keyboard.press("Control+A");
  await page.keyboard.type(text);
}

async function login(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "เข้าสู่ระบบ" })).toBeVisible();
  await typeInto(page, "อีเมล", OWNER.email);
  await typeInto(page, "รหัสผ่าน", OWNER.password);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: /สรุปยอดเดือน/ })).toBeVisible();
}

interface Values {
  date: string;
  amount: string;
  type?: "รายรับ" | "รายจ่าย";
  note: string;
}

async function fillEntry(page: Page, values: Values) {
  await page.getByLabel("วันที่", { exact: true }).fill(values.date);
  await typeInto(page, "จำนวนเงิน (บาท)", values.amount);
  if (values.type) {
    await page.getByLabel(values.type, { exact: true }).focus();
    await page.keyboard.press("Space");
  }
  await typeInto(page, "หมายเหตุ", values.note);
}

async function addEntry(page: Page, values: Values) {
  await page.getByRole("button", { name: "เพิ่มรายการ" }).focus();
  await page.keyboard.press("Enter");
  await fillEntry(page, values);
  await page.keyboard.press("Enter");
  await expect(page.getByText("บันทึกรายการแล้ว")).toBeVisible();
}

function totals(page: Page) {
  const region = page.getByRole("region", { name: /สรุปยอดเดือน/ });
  const value = (name: string) => region.getByText(name).locator("xpath=following-sibling::dd");
  return { income: value("รวมรายรับ"), expense: value("รวมรายจ่าย"), balance: value("ยอดคงเหลือ") };
}

test("[EX-8] asks for the password first, and the forgot screen sends the reset link", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "เข้าสู่ระบบ" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /สรุปยอดเดือน/ })).toHaveCount(0);
  await scan(page);

  await page.getByRole("button", { name: "ลืมรหัสผ่าน" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "ลืมรหัสผ่าน" })).toBeVisible();
  await page.getByRole("button", { name: "ส่งลิงก์ไปที่อีเมล" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toContainText("อีเมลที่ลงทะเบียนไว้");
  await scan(page);

  await page.getByRole("button", { name: "กลับไปหน้าเข้าสู่ระบบ" }).focus();
  await page.keyboard.press("Enter");
  await typeInto(page, "อีเมล", OWNER.email);
  await typeInto(page, "รหัสผ่าน", "wrong-password");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alert")).toContainText("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
  await scan(page);

  await typeInto(page, "รหัสผ่าน", OWNER.password);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: /สรุปยอดเดือน/ })).toBeVisible();
});

test("[EX-7] shows a loading status while entries load, then a guide when there are none", async ({ page }) => {
  await page.route("**/api/entries", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.continue();
  });
  await page.goto("/");
  await typeInto(page, "อีเมล", OWNER.email);
  await typeInto(page, "รหัสผ่าน", OWNER.password);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toContainText("กำลังโหลดข้อมูล");
  await scan(page);
  await expect(page.getByRole("heading", { name: /สรุปยอดเดือน/ })).toBeVisible();
  await expect(page.getByText("ยังไม่มีรายการในเดือนนี้")).toBeVisible();
  await scan(page);
});

test("[EX-7] says the connection failed when the network is down, and retry recovers", async ({ page }) => {
  await page.route("**/api/entries", (route) => route.abort());
  await page.goto("/");
  await typeInto(page, "อีเมล", OWNER.email);
  await typeInto(page, "รหัสผ่าน", OWNER.password);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alert")).toContainText("เชื่อมต่ออินเทอร์เน็ตไม่ได้");
  await expect(page.getByRole("heading", { name: /สรุปยอดเดือน/ })).toHaveCount(0);
  await scan(page);

  await page.unroute("**/api/entries");
  await page.getByRole("button", { name: "ลองอีกครั้ง" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: /สรุปยอดเดือน/ })).toBeVisible();
});

test("[EX-1] a 150 baht expense on the 3rd is listed and raises the month's expenses", async ({ page }) => {
  await login(page);
  await addEntry(page, { date: `${monthBack(2)}-03`, amount: "150", type: "รายจ่าย", note: "ค่าอาหาร" });
  await expect(page.getByRole("listitem").filter({ hasText: "ค่าอาหาร" })).toContainText("รายจ่าย 150.00 บาท");
  await expect(totals(page).expense).toHaveText("150.00 บาท");
  await expect(totals(page).balance).toHaveText("-150.00 บาท");
  await scan(page);
});

test("[EX-2] correcting an amount changes the month's totals at once", async ({ page }) => {
  await login(page);
  await addEntry(page, { date: `${monthBack(3)}-05`, amount: "1500", type: "รายรับ", note: "เงินพิเศษ" });
  await expect(totals(page).income).toHaveText("1,500.00 บาท");

  await page.getByRole("button", { name: /^แก้ไขรายการ เงินพิเศษ/ }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "แก้ไขรายการ" })).toBeVisible();
  await scan(page);
  await typeInto(page, "จำนวนเงิน (บาท)", "150");
  await page.keyboard.press("Enter");
  await expect(page.getByText("แก้ไขรายการแล้ว")).toBeVisible();
  await expect(totals(page).income).toHaveText("150.00 บาท");
  await expect(totals(page).balance).toHaveText("150.00 บาท");
});

test("[EX-3] delete asks first; cancel keeps the entry and confirm removes it", async ({ page }) => {
  await login(page);
  await addEntry(page, { date: `${monthBack(4)}-03`, amount: "80", type: "รายจ่าย", note: "กาแฟ" });
  const deleteButton = page.getByRole("button", { name: /^ลบรายการ กาแฟ/ });

  await deleteButton.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alertdialog")).toContainText("ต้องการลบรายการ");
  await scan(page);
  await expect(page.getByRole("button", { name: "ยกเลิก" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(page.getByText("กาแฟ")).toBeVisible();
  await expect(totals(page).expense).toHaveText("80.00 บาท");

  await deleteButton.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "ยืนยันลบ" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByText("กาแฟ")).toHaveCount(0);
  await expect(totals(page).expense).toHaveText("0.00 บาท");
});

test("[EX-4] an amount of 0 or no type is not saved and the screen says what to fix", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: "เพิ่มรายการ" }).focus();
  await page.keyboard.press("Enter");
  await fillEntry(page, { date: `${monthBack(7)}-03`, amount: "0", type: "รายจ่าย", note: "ศูนย์" });
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alert")).toContainText("จำนวนเงินต้องมากกว่า 0");
  await scan(page);

  // A radio choice cannot be cleared once made, so start over for the "no type" case.
  await page.reload();
  await typeInto(page, "อีเมล", OWNER.email);
  await typeInto(page, "รหัสผ่าน", OWNER.password);
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "เพิ่มรายการ" }).focus();
  await page.keyboard.press("Enter");
  await fillEntry(page, { date: `${monthBack(7)}-03`, amount: "50", note: "ไม่เลือกประเภท" });
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alert")).toContainText("กรุณาเลือกประเภท (รายรับหรือรายจ่าย)");
  await scan(page);
  await page.getByRole("button", { name: "ยกเลิก" }).focus();
  await page.keyboard.press("Enter");
  await page.getByLabel("เดือนที่ดู").selectOption(monthBack(7));
  await expect(page.getByText("ยังไม่มีรายการในเดือนนี้")).toBeVisible();
});

test("[EX-5] searching a note and filtering to expenses of a month", async ({ page }) => {
  await login(page);
  const month = monthBack(5);
  await addEntry(page, { date: `${month}-03`, amount: "150", type: "รายจ่าย", note: "ค่าอาหาร" });
  await addEntry(page, { date: `${month}-04`, amount: "60", type: "รายรับ", note: "คืนค่าอาหาร" });
  await addEntry(page, { date: `${month}-05`, amount: "30", type: "รายจ่าย", note: "ค่าเดินทาง" });

  await typeInto(page, "ค้นหาจากหมายเหตุ", "ค่าอาหาร");
  await expect(page.getByRole("listitem")).toHaveCount(2);
  await expect(page.getByText("ค่าเดินทาง")).toHaveCount(0);
  await scan(page);

  await page.getByLabel("แสดงประเภท").focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(page.getByLabel("แสดงประเภท")).toHaveValue("expense");
  await expect(page.getByRole("listitem")).toHaveCount(1);
  await expect(page.getByRole("listitem")).toContainText("ค่าอาหาร");

  await typeInto(page, "ค้นหาจากหมายเหตุ", "ไม่มีคำนี้");
  await expect(page.getByText("ไม่พบรายการที่ตรงกับคำค้นหาหรือตัวกรอง")).toBeVisible();
  await scan(page);
});

test("[EX-6] the home page shows this month's totals and the previous month can be chosen", async ({ page }) => {
  await login(page);
  await expect(page.getByLabel("เดือนที่ดู")).toHaveValue(monthBack(0));
  await addEntry(page, { date: `${monthBack(1)}-10`, amount: "1000", type: "รายรับ", note: "เดือนก่อน" });
  await addEntry(page, { date: `${monthBack(0)}-01`, amount: "500", type: "รายรับ", note: "รับเดือนนี้" });
  await addEntry(page, { date: `${monthBack(0)}-01`, amount: "200", type: "รายจ่าย", note: "จ่ายเดือนนี้" });
  await expect(page.getByLabel("เดือนที่ดู")).toHaveValue(monthBack(0));
  await expect(totals(page).income).toHaveText("500.00 บาท");
  await expect(totals(page).expense).toHaveText("200.00 บาท");
  await expect(totals(page).balance).toHaveText("300.00 บาท");
  await scan(page);

  await page.getByLabel("เดือนที่ดู").focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByLabel("เดือนที่ดู")).toHaveValue(monthBack(1));
  await expect(totals(page).income).toHaveText("1,000.00 บาท");
  await expect(totals(page).expense).toHaveText("0.00 บาท");
  await expect(totals(page).balance).toHaveText("1,000.00 บาท");
});

test("[EX-9] an entry saved on a phone shows on a computer, and the phone screen needs no zoom or sideways scroll", async ({ browser }) => {
  const phone = await browser.newContext({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });
  const phonePage = await phone.newPage();
  await login(phonePage);
  await addEntry(phonePage, { date: `${monthBack(6)}-03`, amount: "150", type: "รายจ่าย", note: "จากโทรศัพท์" });
  await expect(phonePage.getByText("จากโทรศัพท์")).toBeVisible();
  await scan(phonePage);

  const layout = await phonePage.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    smallButtons: [...document.querySelectorAll("button")].filter((b) => b.getBoundingClientRect().height < 44).length,
    smallText: [...document.querySelectorAll("input, select")].filter(
      (el) => parseFloat(getComputedStyle(el).fontSize) < 16,
    ).length,
  }));
  expect(layout.overflow).toBeLessThanOrEqual(0);
  expect(layout.smallButtons).toBe(0);
  expect(layout.smallText).toBe(0);
  await phone.close();

  const computer = await browser.newContext();
  const computerPage = await computer.newPage();
  await login(computerPage);
  await computerPage.getByLabel("เดือนที่ดู").selectOption(monthBack(6));
  await expect(computerPage.getByRole("listitem").filter({ hasText: "จากโทรศัพท์" })).toContainText("150.00 บาท");
  await computer.close();
});

test("[EX-10] every screen is in Thai and the app opens within a few seconds", async ({ page }) => {
  const started = Date.now();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "เข้าสู่ระบบ" })).toBeVisible();
  expect(Date.now() - started).toBeLessThan(5000);
  await expect(page.locator("html")).toHaveAttribute("lang", "th");
  expect(await page.title()).toMatch(/[ก-๙]/);

  const latin = /[A-Za-z]{2,}/;
  expect(await page.locator("body").innerText()).not.toMatch(latin);
  await page.getByRole("button", { name: "ลืมรหัสผ่าน" }).focus();
  await page.keyboard.press("Enter");
  expect(await page.locator("body").innerText()).not.toMatch(latin);
  await page.getByRole("button", { name: "กลับไปหน้าเข้าสู่ระบบ" }).focus();
  await page.keyboard.press("Enter");
  await typeInto(page, "อีเมล", OWNER.email);
  await typeInto(page, "รหัสผ่าน", OWNER.password);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: /สรุปยอดเดือน/ })).toBeVisible();
  await page.getByRole("button", { name: "เพิ่มรายการ" }).focus();
  await page.keyboard.press("Enter");
  expect(await page.locator("body").innerText()).not.toMatch(latin);
});
