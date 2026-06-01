const { createServer } = require("http");
const path = require("path");
const next = require("next");

const PORT = process.env.PORT || 3030;
const nextApp = next({
  dev: false,
  dir: path.join(__dirname, "..")
});
const handle = nextApp.getRequestHandler();

nextApp.prepare().then(() => {
  const server = createServer((req, res) => {
    handle(req, res);
  });
  server.listen(PORT, (err) => {
    if (err) {
      console.error("[Next.js Server Worker Error]:", err);
      process.exit(1);
    }
    console.log(`[Next.js Server Worker] listening on http://localhost:${PORT}`);
  });
}).catch((err) => {
  console.error("[Next.js Server Worker Prepare Error]:", err);
  process.exit(1);
});
