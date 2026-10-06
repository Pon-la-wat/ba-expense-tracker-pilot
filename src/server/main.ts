import { resolve } from "node:path";
import { createAppServer } from "./index.js";
import { createMailer } from "./mailer.js";
import { seedOwner, Store } from "./store.js";

const port = Number(process.env.PORT ?? "3000");
const dataFile = process.env.DATA_FILE ?? "data/ledger.json";
const store = new Store(dataFile === ":memory:" ? undefined : dataFile);

if (!store.owner) {
  const { OWNER_EMAIL, OWNER_PASSWORD } = process.env;
  if (!OWNER_EMAIL || !OWNER_PASSWORD) {
    console.error("No account yet: set OWNER_EMAIL and OWNER_PASSWORD for the first start.");
    process.exit(1);
  }
  await seedOwner(store, OWNER_EMAIL, OWNER_PASSWORD);
}

const server = createAppServer({
  store,
  mailer: createMailer(process.env.MAIL_WEBHOOK_URL),
  publicUrl: (process.env.PUBLIC_URL ?? `http://127.0.0.1:${port}`).replace(/\/$/, ""),
  staticDir: resolve(import.meta.dirname, "../../client"),
});
server.listen(port, process.env.HOST ?? "127.0.0.1", () => {
  console.log(`App on http://127.0.0.1:${port}`);
});
