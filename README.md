# 🛸 Pi Agent xY — Standalone Desktop & Web UI

[![Version](https://img.shields.io/npm/v/@zwbigi/pi-agent-xy?color=blueviolet&style=flat-square)](https://www.npmjs.com/package/@zwbigi/pi-agent-xy)
[![License](https://img.shields.io/github/license/demon820308/Pi-agent-xY?style=flat-square&color=blue)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-15.0%20(Webpack)-black?logo=next.js&style=flat-square)](https://nextjs.org/)
[![Electron](https://img.shields.io/badge/Electron-30.0%2B-47848F?logo=electron&style=flat-square)](https://www.electronjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?logo=typescript&style=flat-square)](https://www.typescriptlang.org/)
[![CI/CD Build](https://img.shields.io/github/actions/workflow/status/demon820308/Pi-agent-xY/build.yml?branch=main&style=flat-square&logo=github-actions)](https://github.com/demon820308/Pi-agent-xY/actions)

> 🌌 **Pi Agent xY** 是为前沿 AI 编程智能体 [Pi Coding Agent](https://github.com/badlogic/pi-mono) 打造的顶级交互系统。现已原生支持 **Next.js Web 模式** 与 **Electron Standalone 独立桌面客户端** 完美融合，为您提供无与伦比的沉浸式极客编码工作台！

---

## 🌟 核心闪光点

* 🖥️ **全平台独立客户端** — 原生支持 Windows (.exe 安装包) 与 macOS (.dmg / .app)，双击一键极速起航，内置极简隐藏式菜单栏，视觉体验更加一体化。
* 🌳 **会话分叉与分支浏览** — 独创会话内树状分支切换器与可视化分支导航，一键 Fork 任意历史对话，轻松在单会话内探索无穷的编程可能。
* 🪄 **多模态智能识图与提示词反推** — 内置精美毛玻璃效果图片反推面板，支持一键将图片解析为结构化文本或 `image_prompt` JSON；系统可**智能判别大模型视觉能力**：
  * **视觉模型**（如 `Claude 4.5`, `GPT-5.5`, `MiMo-V2.5`, `Gemini 3.5`, `Kimi K2.6` 等）：Canvas 智能级无损压缩，直接原生透传。
  * **非视觉模型**（如 `DeepSeek-R1`, `DeepSeek-V3`, `o1-mini` 等）：前端毫秒级智能拦截阻断并弹出红色警告，彻底防止历史会话污染。
* 🤖 **Gem-xY 自定义智能体生态** — 侧边栏可视化 Gem 编辑器，支持 Emoji 头像定制、独立系统提示词预设、模型提供商绑定、可用工具精细过滤，并支持知识库（RAG）附加文件加载。
* 📂 **内置集成式编码沙盒** — 侧边栏集成式文件树浏览器，支持双标签页切换（Chat 与 Open Files），内置**离线 PPTX 高清预览**与 **HTML 交互式全屏沙盒渲染**。

---

## 🚀 快速开始

### 📦 桌面端 (Standalone App)

#### Windows 安装包下载
直接前往 [GitHub Releases](https://github.com/demon820308/Pi-agent-xY/releases) 下载最新生成的 `Pi Agent xY Desktop Setup 0.6.24.exe` 一键安装。

#### macOS 安装包下载与 Gatekeeper 签名警告解决 (重要)
前往 [GitHub Releases](https://github.com/demon820308/Pi-agent-xY/releases) 下载 `.dmg` 安装包，将其拖拽至 `Applications` 目录中。

> ⚠️ **macOS 提示“文件已损坏”或“身份不明的开发者”解决办法**
> 由于 standalone 桌面客户端未在 Apple 开发者账号进行官方代码签名，macOS Gatekeeper 安全体系可能会在首次打开应用时拦截，并弹出“软件已损坏，无法打开”或“无法验证开发者”等警告。
> **极速解锁与绕过指令**：
> 请打开您的 Mac 终端（Terminal），直接复制并执行以下命令（以清除 macOS 的隔离 quarantine 标识属性）：
> ```bash
> xattr -cr /Applications/Pi\ Agent\ xY\ Desktop.app
> ```
> 运行后，即可直接在 Launchpad 或 Applications 中双击秒开，完美运行！

#### 开发调试 (Dev Mode)
```bash
# 并发启动 Next.js 本地微服务（3030 端口）并自动唤起 Electron 主窗口
npm run electron:dev
```

#### 生产打包 (Production Build)
```bash
# 自动编译 Next.js production 优化包并生成 Windows 原生安装程序
npm run electron:build
```

---

### 🌐 网页端 (Web UI)

#### 1. 免安装瞬时运行 (NPX)
```bash
npx @zwbigi/pi-agent-xy@latest
```

#### 2. 全局安装使用
```bash
npm install -g @zwbigi/pi-agent-xy
pi-agent-xy
```
启动后自动在浏览器拉起工作台：[http://localhost:30142](http://localhost:30142)

#### 3. 丰富命令行参数
```bash
pi-agent-xy --port 8080               # 自定义启动端口
pi-agent-xy --hostname 127.0.0.1      # 限制仅本机回环访问
pi-agent-xy -p 8080 -H 127.0.0.1      # 参数组合使用

PORT=8080 pi-agent-xy                 # 也支持环境变量注入
```

---

## 🏗️ 架构设计图 (Hybrid Architecture)

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Electron Desktop Application                    │
│                                                                        │
│   ┌──────────────────────────┐          ┌──────────────────────────┐   │
│   │     Render UI Window     │          │     Main Process Core    │   │
│   │                          │          │                          │   │
│   │   Chromium Client view   │◀──(3030)─│   Spawns Next.js Server  │   │
│   │    (localhost:3030)      │          │   as Child Process       │   │
│   └──────────────────────────┘          └──────────────────────────┘   │
└─────────────────────────────────────────────────────────┬──────────────┘
                                                          │
                                         (RPC startSession & lifecycle sync)
                                                          ▼
                                          ┌──────────────────────────────┐
                                          │      AgentSession (Node)     │
                                          │                              │
                                          │   ~/.pi/agent/sessions/      │
                                          └──────────────────────────────┘
```

* **生命周期双向销毁**：当 Electron 窗口关闭、崩溃或主动退出时，主进程将自动执行 `process.kill()` 彻底回收后台的 Next.js 常驻微服务与沙盒环境，不残留僵尸进程，绝对不污染系统端口。

---

## 🛠️ 项目文件结构

```text
├── .github/workflows/   # CI/CD 自动化构建流（支持 Mac .dmg / Windows .exe 自动编译）
├── app/
│   ├── api/             # 核心微服务路由 APIs
│   │   ├── sessions/    # 会话读写及历史回档接口
│   │   ├── agent/       # 智能体交互、执行、SSE 实时事件流
│   │   ├── gem-xy/      # Gem-xY 自定义智能体模板 CRUD
│   │   └── files/       # 沙盒文件浏览器 IO 流
│   ├── layout.tsx       # 全局视窗基础布局
│   └── page.tsx         # 应用主页面入口
├── components/          # 极致视觉组件系统
│   ├── AppShell.tsx     # 主视窗骨架 + 状态分发 + 标签页管理
│   ├── ChatWindow.tsx   # 聊天视窗核心 + 流式输出 + 树状 Fork 决策
│   ├── SessionSidebar.tsx# 复合式侧边栏（会话树、SandBox 文件系统、Gem 面板）
│   ├── GemEditorModal.tsx# 可视化 Gem-xY 智能体编辑器
│   ├── FileViewer.tsx   # 高清 PPTX 渲染 + 实时交互式 HTML 沙盒预览
│   └── BranchNavigator.tsx# 会话内历史分支快捷树导航
├── electron/
│   └── main.js          # Electron 桌面端主进程（端口探测、进程就绪检测与自销毁）
├── lib/                 # 核心基础逻辑与数据模型
│   ├── rpc-manager.ts   # 智能体生命周期 RPC 容器
│   ├── session-reader.ts# 高性能 .jsonl 异步流解析器
│   └── gem-xy.ts        # 自定义智能体数据引擎
├── tsconfig.json        # 强类型 TypeScript 配置文件
└── package.json         # 依赖项声明、多端脚本及 electron-builder 打包设置
```

---

## ⚙️ 核心配置指引

* 🗄️ **会话文件存储**：默认从当前工作目录下的 `~/.pi/agent/sessions/` 异步读取 `.jsonl` 会话文件。可通过注入环境变量 `PI_CODING_AGENT_DIR` 随意调整读取根路径。
* 🤖 **可用模型清单**：系统支持的全部模型池声明存储在 `~/.pi/agent/models.json` 中，您可以通过侧边栏下方的 **Models 面板** 直接进行可视化编辑与提供商绑定。
* 🛸 **自定义 Gem 设定**：所有 Gem-xY 智能体模板保存在本地的 `~/.pi/agent/gem_xy.json` 文件内，侧边栏内置完整的修改、创建及知识库绑定入口。

---

## 🔧 开发人员指南

```bash
# 1. 克隆并安装依赖
git clone https://github.com/demon820308/Pi-agent-xY.git
cd Pi-agent-xY
npm install

# 2. 启动开发模式（Next.js Web UI）
npm run dev

# 3. 运行严格类型安全检查
npx tsc --noEmit

# 4. 代码风格静态扫描
npx next lint
```

> ⚠️ **重要开发陷阱提示**：开发环境下请绝对不要主动运行 `next build` 避免污染 `.next/` 目录；所有生产环境编译产物将由 `electron-builder` 在隔离沙盒下安全完成。

---

## 📜 许可证

本项目基于 [MIT](LICENSE) 开源协议发布，欢迎参与共建贡献！
