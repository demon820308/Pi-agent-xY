const { app, BrowserWindow } = require("electron");
const path = require("path");
const http = require("http");
const fs = require("fs");
const os = require("os");

let mainWindow;
const PORT = 3030;

// ─── Logging ────────────────────────────────────────────────────────────────
const logDir = path.join(os.homedir(), ".pi", "agent");
try {
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
} catch (e) {}
const logFile = path.join(logDir, "server.log");
const logStream = fs.createWriteStream(logFile, { flags: "a" });

function log(msg) {
  const time = new Date().toISOString();
  try { logStream.write(`[${time}] ${msg}\n`); } catch (e) {}
  console.log(`[${time}] ${msg}`);
}

process.on("uncaughtException", (err) => {
  log(`[Uncaught Exception]: ${err.stack || err}`);
});
process.on("unhandledRejection", (reason) => {
  log(`[Unhandled Rejection]: ${reason}`);
});

// ─── Next.js server (runs in main process — has full asar hooks) ─────────────
//
// Why in-process instead of utilityProcess.fork():
//   utilityProcess stdout/stderr pipes silently fail in packaged builds,
//   so any crash inside the worker is invisible. The main process already
//   has Electron's asar interception active, so require('next') and all
//   fs calls for .next / node_modules / public resolve correctly.
//
async function startNextServer() {
  if (!app.isPackaged) return; // dev: concurrently already runs Next.js

  // __dirname is inside app.asar; one level up is the app root.
  // Electron's asar hooks transparently redirect:
  //   app.asar/node_modules/next  → app.asar.unpacked/node_modules/next
  //   app.asar/.next/…            → app.asar.unpacked/.next/…
  //   app.asar/public/…           → served from asar archive  ✓
  const appDir = path.join(__dirname, "..");
  log(`Starting Next.js in main process. appDir=${appDir}`);

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const next = require("next");
    const nextApp = next({ dev: false, dir: appDir });
    const handle = nextApp.getRequestHandler();

    log("Calling nextApp.prepare()…");
    await nextApp.prepare();
    log("nextApp.prepare() done. Starting HTTP server…");

    await new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => handle(req, res));
      server.listen(PORT, "127.0.0.1", (err) => {
        if (err) { reject(err); return; }
        log(`Next.js listening on http://localhost:${PORT}`);
        resolve();
      });
    });
  } catch (err) {
    log(`[Next.js Start Error]: ${err.stack || err}`);
  }
}

// ─── Loading / error pages ───────────────────────────────────────────────────
function loadingHTML() {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Pi Agent xY – Starting…</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#0d1117;color:#c9d1d9;font-family:system-ui,-apple-system,sans-serif;
       display:flex;flex-direction:column;align-items:center;justify-content:center;
       height:100vh;gap:20px}
  .ring{width:48px;height:48px;border:3px solid #21262d;border-top-color:#58a6ff;
        border-radius:50%;animation:spin .8s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  p{color:#8b949e;font-size:14px;letter-spacing:.02em}
</style></head>
<body>
  <div class="ring"></div>
  <p>Starting Pi Agent xY…</p>
</body></html>`;
}

function errorHTML() {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Pi Agent xY – Error</title>
<style>
  body{background:#0d1117;color:#f85149;font-family:system-ui;padding:40px;line-height:1.6}
  code{background:#161b22;padding:2px 6px;border-radius:4px;font-size:13px;color:#e3b341}
</style></head>
<body>
  <h2>Server failed to start</h2>
  <p>Check the log for details:</p>
  <p><code>${logFile.replace(/\\/g, "\\\\")}</code></p>
</body></html>`;
}

// ─── Server readiness polling ────────────────────────────────────────────────
const CHECK_INTERVAL_MS = 300;
const MAX_WAIT_MS = 60_000; // 60 s

function waitForServer(callback) {
  const deadline = Date.now() + MAX_WAIT_MS;

  function attempt() {
    if (!mainWindow || mainWindow.isDestroyed()) return;

    if (Date.now() > deadline) {
      log("Server did not become ready within 60 s — showing error page");
      mainWindow.loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(errorHTML())}`
      );
      return;
    }

    const req = http.get(`http://127.0.0.1:${PORT}/api/models`, (res) => {
      if (res.statusCode === 200) {
        callback();
      } else {
        res.resume();
        setTimeout(attempt, CHECK_INTERVAL_MS);
      }
    });
    req.on("error", () => setTimeout(attempt, CHECK_INTERVAL_MS));
    req.end();
  }

  attempt();
}

// ─── Window creation ─────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "Pi Agent xY Desktop",
    icon: path.join(__dirname, "../public/icon.png"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    autoHideMenuBar: true,
    backgroundColor: "#0d1117",
    show: false,
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());

  // F12 / Ctrl+Shift+I → DevTools; F5 / Ctrl+R → Reload
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (
      input.key === "F12" ||
      (input.control && input.shift && input.key.toLowerCase() === "i")
    ) {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
    if (
      input.key === "F5" ||
      (input.control && input.key.toLowerCase() === "r")
    ) {
      mainWindow.webContents.reload();
      event.preventDefault();
    }
  });

  if (app.isPackaged) {
    // Show loading spinner immediately; swap to real URL once server is ready
    mainWindow.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(loadingHTML())}`
    );
    waitForServer(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.loadURL(`http://localhost:${PORT}`);
      }
    });
  } else {
    // Dev: Next.js dev server is already running via concurrently
    mainWindow.loadURL(`http://localhost:${PORT}`);
  }

  mainWindow.on("closed", () => { mainWindow = null; });
}

// ─── App lifecycle ───────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow();
  // Start Next.js in background; waitForServer() will pick it up when ready
  startNextServer().catch((e) => log(`[startNextServer uncaught]: ${e}`));

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
