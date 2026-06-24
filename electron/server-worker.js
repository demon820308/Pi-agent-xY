const { createServer } = require("http");
const path = require("path");
const next = require("next");

const PORT = process.env.PORT || 3030;

// When packaged in an asar archive, __dirname points inside app.asar but
// the .next build output is extracted to app.asar.unpacked (via asarUnpack).
// We must resolve the actual unpacked directory so Next.js can find its files.
function resolveAppDir() {
  const appDir = path.join(__dirname, "..");
  // Replace app.asar path with the unpacked counterpart if it exists
  const unpackedDir = appDir.replace("app.asar", "app.asar.unpacked");
  try {
    const fs = require("fs");
    if (fs.existsSync(path.join(unpackedDir, ".next"))) {
      return unpackedDir;
    }
  } catch (e) {}
  return appDir;
}

const nextApp = next({
  dev: false,
  dir: resolveAppDir()
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
