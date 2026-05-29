const { app, BrowserWindow } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const http = require("http");

let mainWindow;
let nextProcess;
const PORT = 3030;

function checkServerReady(callback) {
  const req = http.get(`http://localhost:${PORT}/api/models`, (res) => {
    if (res.statusCode === 200) {
      callback();
    } else {
      setTimeout(() => checkServerReady(callback), 250);
    }
  });
  req.on("error", () => {
    setTimeout(() => checkServerReady(callback), 250);
  });
}

function startNextServer() {
  if (app.isPackaged) {
    // In production, we run the compiled Next.js service.
    // Locate the Next.js CLI entry point dynamically for robust path resolving.
    const pkgDir = path.join(__dirname, "..");
    let nextBin;
    try {
      nextBin = require.resolve("next/dist/bin/next", { paths: [pkgDir] });
    } catch {
      try {
        const nextPkg = require.resolve("next/package.json", { paths: [pkgDir] });
        nextBin = path.join(path.dirname(nextPkg), "dist", "bin", "next");
      } catch {
        nextBin = path.join(pkgDir, "node_modules", "next", "dist", "bin", "next");
      }
    }

    nextProcess = spawn(process.execPath, [
      nextBin,
      "start",
      "-p",
      String(PORT)
    ], {
      cwd: pkgDir,
      env: { ...process.env, NODE_ENV: "production" }
    });

    nextProcess.stdout.on("data", (data) => console.log(`[Next.js]: ${data}`));
    nextProcess.stderr.on("data", (data) => console.error(`[Next.js Err]: ${data}`));
  }
}

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
    autoHideMenuBar: true, // Hide top menu bar for premium native feel
  });

  const url = `http://localhost:${PORT}`;
  if (app.isPackaged) {
    checkServerReady(() => {
      mainWindow.loadURL(url);
    });
  } else {
    // In dev environment, we assume concurrently started the Next.js dev server already
    mainWindow.loadURL(url);
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  startNextServer();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// Clean up background Next.js process before quit to release port and resources
app.on("will-quit", () => {
  if (nextProcess) {
    nextProcess.kill();
  }
});
