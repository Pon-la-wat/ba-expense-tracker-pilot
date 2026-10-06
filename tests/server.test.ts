// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OWNER, call, loginToken, startApp, type TestApp } from "./helpers";

let app: TestApp;
beforeEach(async () => {
  app = await startApp();
});
afterEach(async () => {
  await app.close();
});

const expense = { date: "2026-10-03", amount: "150", type: "expense", note: "ค่าอาหาร" };

describe("API", () => {
  it("[EX-8] data is refused without a password, and a reset link is mailed to the registered address", async () => {
    expect((await call(app, "GET", "/api/entries")).status).toBe(401);
    expect((await call(app, "POST", "/api/login", { ...OWNER, password: "wrong" })).status).toBe(401);

    expect((await call(app, "POST", "/api/forgot", {})).status).toBe(200);
    expect(app.mails).toHaveLength(1);
    expect(app.mails[0]?.to).toBe(OWNER.email);
    const token = /reset=([0-9a-f]+)/.exec(app.mails[0]?.text ?? "")?.[1] ?? "";
    expect(app.mails[0]?.text).toContain(`http://app.test/?reset=${token}`);

    const short = await call(app, "POST", "/api/reset", { token, password: "short" });
    expect(short.status).toBe(400);
    expect((await call(app, "POST", "/api/reset", { token: "nope", password: "new-password-1" })).status).toBe(400);

    expect((await call(app, "POST", "/api/reset", { token, password: "new-password-1" })).status).toBe(200);
    expect((await call(app, "POST", "/api/reset", { token, password: "another-pass-2" })).status).toBe(400);
    expect((await call(app, "POST", "/api/login", OWNER)).status).toBe(401);
    const login = await call(app, "POST", "/api/login", { email: OWNER.email, password: "new-password-1" });
    expect(login.status).toBe(200);
  });

  it("[EX-9] an entry saved from one device is the same entry on another", async () => {
    const phone = await loginToken(app);
    const computer = await loginToken(app);
    const created = await call(app, "POST", "/api/entries", expense, phone);
    expect(created.status).toBe(201);
    const seen = await call(app, "GET", "/api/entries", undefined, computer);
    expect(seen.data.entries).toEqual([created.data.entry]);
  });

  it("[EX-1] a valid entry is stored and listed", async () => {
    const token = await loginToken(app);
    const created = await call(app, "POST", "/api/entries", expense, token);
    expect(created.data.entry).toMatchObject({ date: "2026-10-03", amount: 150, type: "expense", note: "ค่าอาหาร" });
    expect((await call(app, "GET", "/api/entries", undefined, token)).data.entries).toHaveLength(1);
  });

  it("[EX-2] every field of an entry can be changed", async () => {
    const token = await loginToken(app);
    const { entry } = (await call(app, "POST", "/api/entries", { ...expense, amount: "1500" }, token)).data;
    const changed = { date: "2026-10-04", amount: "15", type: "income", note: "แก้แล้ว" };
    const updated = await call(app, "PUT", `/api/entries/${entry.id}`, changed, token);
    expect(updated.data.entry).toEqual({ id: entry.id, date: "2026-10-04", amount: 15, type: "income", note: "แก้แล้ว" });
    expect((await call(app, "PUT", "/api/entries/missing", changed, token)).status).toBe(404);
  });

  it("[EX-3] a deleted entry is gone from the list", async () => {
    const token = await loginToken(app);
    const { entry } = (await call(app, "POST", "/api/entries", expense, token)).data;
    expect((await call(app, "DELETE", `/api/entries/${entry.id}`, undefined, token)).status).toBe(200);
    expect((await call(app, "GET", "/api/entries", undefined, token)).data.entries).toEqual([]);
  });

  it("[EX-4] an invalid entry is not stored and the reasons come back", async () => {
    const token = await loginToken(app);
    const bad = await call(app, "POST", "/api/entries", { date: "2026-10-03", amount: "0", type: "" }, token);
    expect(bad.status).toBe(400);
    expect(bad.data.errors).toEqual(["จำนวนเงินต้องมากกว่า 0", "กรุณาเลือกประเภท (รายรับหรือรายจ่าย)"]);
    expect((await call(app, "GET", "/api/entries", undefined, token)).data.entries).toEqual([]);
  });
});
