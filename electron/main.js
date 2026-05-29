const { app, BrowserWindow } = require("electron");
const path = require("path");
const http = require("http");

let mainWindow;
let nextServer;
const PORT = 3030;

function startNextServer() {
  if (app.isPackaged) {
    try {
      // Run Next.js programmatically in production inside the main process.
      // This completely avoids child_process.spawn issues and the need for a separate Node binary.
      const next = require("next");
      const nextApp = next({
        dev: false,
        dir: path.join(__dirname, "..")
      });
      const handle = nextApp.getRequestHandler();

      nextApp.prepare().then(() => {
        nextServer = http.createServer((req, res) => {
          handle(req, res);
        });
        nextServer.listen(PORT, (err) => {
          if (err) {
            console.error("[Next.js Server Error]:", err);
            return;
          }
          console.log(`[Next.js Server] listening on http://localhost:${PORT}`);
        });
      }).catch((err) => {
        console.error("[Next.js Prepare Error]:", err);
      });
    } catch (e) {
      console.error("[Next.js Module Load Error]:", e);
    }
  }
}

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

  // Register F12 / Ctrl+Shift+I to toggle DevTools, and F5 / Ctrl+R to reload
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.key === "F12" || (input.control && input.shift && input.key.toLowerCase() === "i")) {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
    if (input.key === "F5" || (input.control && input.key.toLowerCase() === "r")) {
      mainWindow.webContents.reload();
      event.preventDefault();
    }
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

// Clean up background Next.js server before quit
app.on("will-quit", () => {
  if (nextServer) {
    nextServer.close();
  }
});
