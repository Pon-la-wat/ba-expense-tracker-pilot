import type { AddressInfo } from "node:net";
import { createAppServer } from "../src/server/index";
import type { Mail } from "../src/server/mailer";
import { seedOwner, Store } from "../src/server/store";

export const OWNER = { email: "owner@example.com", password: "correct-horse" };

export interface TestApp {
  url: string;
  store: Store;
  mails: Mail[];
  close: () => Promise<void>;
}

export async function startApp(): Promise<TestApp> {
  const store = new Store();
  await seedOwner(store, OWNER.email, OWNER.password);
  const mails: Mail[] = [];
  const server = createAppServer({
    store,
    mailer: async (mail) => {
      mails.push(mail);
    },
    publicUrl: "http://app.test",
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    store,
    mails,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

export async function call(
  app: TestApp,
  method: string,
  path: string,
  body?: unknown,
  token?: string,
): Promise<{ status: number; data: any }> {
  const response = await fetch(`${app.url}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json() };
}

export async function loginToken(app: TestApp): Promise<string> {
  const { data } = await call(app, "POST", "/api/login", OWNER);
  return data.token as string;
}
