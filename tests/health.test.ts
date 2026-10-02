// @vitest-environment node
import type { AddressInfo } from "node:net";
import { expect, it } from "vitest";
import { createAppServer } from "../src/server/index.js";

it("answers the health check", async () => {
  const server = createAppServer();
  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", resolve),
  );
  try {
    const { port } = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${port}/api/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
