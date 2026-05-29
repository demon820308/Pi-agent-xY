# Pi Agent xY Standalone Desktop Application (Electron) Setup Plan

我们计划在全新的独立目录 `E:\Pi-xY` 中，为当前 Web 项目进行桌面端软件打包工程的建设，从而将 Pi Agent xY 转化为一个具备原生集成能力的桌面软件（支持 `.exe` / `.dmg` / `.app`）。

在独立目录 `E:\Pi-xY` 进行开发，能保障原有的 Web 项目生产目录 `d:\Pi-Web\pi-web-src` 保持绝对纯净，互不干扰。

---

## 🏗️ 桌面端应用架构设计

我们采用 **“Electron 主窗口 + 后台 Next.js 本地微服务”** 的混合架构：
```
┌─────────────────────────────────────────────────────────┐
│                      Electron (App)                     │
│                                                         │
│  ┌──────────────────┐             ┌──────────────────┐  │
│  │   渲染进程 (UI)   │             │   主进程 (Main)  │  │
│  │                  │             │                  │  │
│  │  Chromium Window │◀───(Port)───│  Spawns Next.js  │  │
│  │   (localhost)    │             │   Child Process  │  │
│  └──────────────────┘             └──────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

1. **Electron 主进程 (`main.js`)**：
   - 启动时动态生成可用端口，或者锁定默认端口 `3030`。
   - **生产环境下**：通过 Node.js `child_process` 模块自动拉起 Next.js 生产环境服务进程 (`node node_modules/next/dist/bin/next start`)。
   - **双向生命周期同步**：当 Electron 主进程收到窗口全部关闭、崩溃或主动退出指令时，执行 `process.kill()` 彻底清除后台常驻的 Next.js 服务，释放系统端口与内存，杜绝进程残留。
   - 检测本地服务就绪后，唤起主窗口载入 Web 内容，隐藏默认顶部菜单栏以提供极致的沉浸式桌面客户端视觉。

2. **热更新与快捷交互**：
   - 保留 Next.js 原生的热重载 (Hot-reload) 与 SSE 实时事件流，使得应用内的文件监控、反推提示词和聊天流畅度与浏览器端保持 100% 一致。

---

## Proposed Changes

我们将新建独立工程目录 `E:\Pi-xY` 并进行如下文件配置设计：

### 1. 初始化独立工作区 [E:\Pi-xY](file:///E:/Pi-xY) [NEW]
通过安全的高速命令行，将原有的 Web 核心源码完整复制至新目录，过滤掉 `node_modules`、`.next` 及 `.git` 等缓存与历史垃圾，使得新包初始保持超轻量。

---

### 2. 桌面级配置文件新增

#### [NEW] [main.js](file:///E:/Pi-xY/electron/main.js)
实现 Electron 主进程入口控制逻辑：
```javascript
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
    // 生产环境下运行编译后的 Next.js standalone 服务
    nextProcess = spawn("node", [
      path.join(__dirname, "../node_modules/next/dist/bin/next"),
      "start",
      "-p",
      String(PORT)
    ], {
      cwd: path.join(__dirname, ".."),
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
    icon: path.join(__dirname, "../public/favicon.ico"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    autoHideMenuBar: true, // 默认隐藏顶部菜单栏
  });

  const url = `http://localhost:${PORT}`;
  if (app.isPackaged) {
    checkServerReady(() => {
      mainWindow.loadURL(url);
    });
  } else {
    // 开发环境下假定用户已手动启动了 npm run dev
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

// 在退出前彻底销毁后台子进程
app.on("will-quit", () => {
  if (nextProcess) {
    nextProcess.kill();
  }
});
```

---

### 3. 项目配置文件修改

#### [MODIFY] [package.json](file:///E:/Pi-xY/package.json)
* **修改点**：
  * 在 `devDependencies` 中增加 `electron` (v30+) 与 `electron-builder` (v24+)。
  * 在 `dependencies` 中增加 `concurrently` (支持开发环境下并发多命令运行)。
  * 添加桌面运行与构建的专属 npm 指令：
    ```json
    "main": "electron/main.js",
    "scripts": {
      "electron:dev": "concurrently \"npm run dev\" \"wait-on http://localhost:3030 && electron .\"",
      "electron:build": "npm run build && electron-builder"
    }
    ```
  * 配置 `electron-builder` 打包描述，为不同系统平台输出完美自适应的软件安装文件。

---

## 🎯 Verification & Execution Plan

### 第一阶段：目录同步与依赖配置
1. 新建 `E:\Pi-xY` 工作区。
2. 批量同步除去编译残留和 `.git` 之外的所有 Web 源文件。
3. 请求 `E:\Pi-xY` 的读写权限。
4. 安装桌面包开发依赖：`npm install --save-dev electron electron-builder wait-on`，并安装 `concurrently`。

### 第二阶段：构建本地联调 (Development)
1. 运行 `npm run electron:dev` 验证 Electron 能否拉起 Chromium 视窗并正常透传端口。
2. 调测本地会话与图片放大、大图灯箱预览，验证底层 Node API 全部就绪。

### 第三阶段：多平台安装包发布 (Packaging)
1. 在 Windows 上执行：
   ```bash
   npm run electron:build
   ```
2. 观察 `E:\Pi-xY\dist\` 下生成的 `.exe` 安装包以及免安装便携版。
3. 双击运行最终生成的桌面应用，核验完全脱离终端控制台后的桌面级全功能交互体验。
