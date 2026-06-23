const { app, BrowserWindow } = require("electron");
const { fork, execSync } = require("child_process");
const path = require("path");
const http = require("http");

let mainWindow;
let nextProcess;
const PORT = 3030;

function getShellEnv() {
  if (process.platform === "win32") {
    return process.env;
  }
  try {
    const shell = process.env.SHELL || "/bin/zsh";
    const output = execSync(`${shell} -lic 'node -e "console.log(JSON.stringify(process.env))"'`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 3000
    });
    return { ...process.env, ...JSON.parse(output) };
  } catch (e) {
    console.error("[Shell Env Capture Error]:", e);
    return process.env;
  }
}

function startNextServer() {
  if (app.isPackaged) {
    try {
      const serverPath = path.join(__dirname, "server-worker.js");
      const env = getShellEnv();
      
      // Fork Next.js server as a separate child process (Electron Helper)
      nextProcess = fork(serverPath, [], {
        cwd: path.join(__dirname, ".."),
        env: { ...env, PORT, NODE_ENV: "production" },
        stdio: "inherit"
      });
      
      nextProcess.on("exit", (code) => {
        console.log(`[Next.js Server Worker] exited with code ${code}`);
      });
    } catch (e) {
      console.error("[Next.js Spawn Error]:", e);
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
  if (nextProcess) {
    nextProcess.kill();
  }
});
