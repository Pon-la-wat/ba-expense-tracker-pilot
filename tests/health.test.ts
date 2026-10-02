// @vitest-environment node
import { expect, it } from "vitest";
import { call, startApp } from "./helpers";

it("answers the health check", async () => {
  const app = await startApp();
  try {
    const { status, data } = await call(app, "GET", "/api/health");
    expect(status).toBe(200);
    expect(data).toEqual({ status: "ok" });
  } finally {
    await app.close();
  }
});
