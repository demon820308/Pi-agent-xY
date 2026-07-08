const { app, BrowserWindow, shell } = require("electron");
const { fork, execSync } = require("child_process");
const path = require("path");
const http = require("http");
const fs = require("fs");
const os = require("os");

let mainWindow;
let nextProcess;
const PORT = 3030;

const logDir = path.join(os.homedir(), ".pi", "agent");
try {
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
} catch (e) {
  // ignore
}
const logFile = path.join(logDir, "server.log");
const logStream = fs.createWriteStream(logFile, { flags: "a" });

function log(msg) {
  const time = new Date().toISOString();
  try {
    logStream.write(`[${time}] ${msg}\n`);
  } catch (e) {
    // ignore
  }
  console.log(`[${time}] ${msg}`);
}

process.on("uncaughtException", (err) => {
  log(`[Uncaught Exception in Main Process]: ${err.stack || err}`);
});

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
      
      log(`Starting Next.js Server Worker via child_process.fork from path: ${serverPath}`);
      
      // Fork Next.js server as a separate child process (Electron Helper)
      nextProcess = fork(serverPath, [], {
        cwd: app.isPackaged ? path.dirname(app.getPath("exe")) : path.join(__dirname, ".."),
        env: {
          ...env,
          PORT,
          NODE_ENV: "production",
          APP_ROOT: path.join(__dirname, ".."),
          PI_CODING_AGENT_DIR: path.join(os.homedir(), ".pi", "agent")
        },
        stdio: "inherit"
      });
      
      nextProcess.on("exit", (code) => {
        log(`[Next.js Server Worker] exited with code ${code}`);
      });
    } catch (e) {
      log(`[Next.js Spawn Error]: ${e.stack || e}`);
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

  // Open external links in default browser
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith("http:") || url.startsWith("https:")) {
      try {
        const parsedUrl = new URL(url);
        if (parsedUrl.host !== `localhost:${PORT}`) {
          event.preventDefault();
          shell.openExternal(url);
        }
      } catch (e) {
        // ignore
      }
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http:") || url.startsWith("https:")) {
      try {
        const parsedUrl = new URL(url);
        if (parsedUrl.host !== `localhost:${PORT}` || url.includes("/api/deep-research/export-pdf")) {
          shell.openExternal(url);
          return { action: "deny" };
        }
      } catch (e) {
        // ignore
      }
    }
    return { action: "allow" };
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
