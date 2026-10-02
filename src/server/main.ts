import { createAppServer } from "./index.js";

const port = Number(process.env.PORT ?? "3000");
createAppServer().listen(port, "127.0.0.1", () => {
  console.log(`API on http://127.0.0.1:${port}`);
});
