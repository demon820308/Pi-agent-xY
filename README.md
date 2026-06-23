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
* 🎨 **Design Critic 视觉设计评审与克隆** — 支持上传截图/输入 URL 触发自动截图，具备以下强悍的视觉还原与二次开发能力：
  * **局部微调**：支持在截图上直接鼠标拉框划定感兴趣区域，为该区域描述具体的修改需求，自动完成 HTML 重构及生成对应设计思路文档。
  * **整体复刻**：结合多套精选设计系统，一键反推 UI 并重新生成像素级还原的现代化 HTML 页面及样式体系。
* 🔍 **Deep Research 深度研究工作台** — 引入长上下文流式递归研究管线。支持多层深度与广度递归抓取探索、主动查漏补缺（Gap Checking）、自动数据归纳（Scoping）与发现总结（Learning）。内置可视化的研究日志流程节点展示，并自动保存与加载研究历史。
* 📊 **AI 智能 PPT 生成与排版** — 集成 AI 演示文稿一键生成大纲与排版工坊，支持全流程生成进度大盘展示与内置的 PPTX 幻灯片离线无依赖高清预览。
* 🪄 **多模态智能识图与提示词反推** — 内置精美毛玻璃效果图片反推面板，支持一键将图片解析为结构化文本或 `image_prompt` JSON；系统可**智能判别大模型视觉能力**：
  * **视觉模型**（如 `Claude 4.5`, `GPT-5.5`, `MiMo-V2.5`, `Gemini 3.5`, `Kimi K2.6` 等）：Canvas 智能级无损压缩，直接原生透传。
  * **非视觉模型**（如 `DeepSeek-R1`, `DeepSeek-V3`, `o1-mini` 等）：前端毫秒级智能拦截阻断并弹出红色警告，彻底防止历史会话污染。
* 🤖 **Gem-xY 自定义智能体生态** — 侧边栏可视化 Gem 编辑器，支持 Emoji 头像定制、独立系统提示词预设、模型提供商绑定、可用工具精细过滤，并支持知识库（RAG）附加文件加载。
* 📂 **内置集成式编码沙盒** — 侧边栏集成式文件树浏览器，支持双标签页切换（Chat 与 Open Files），内置**离线 PPTX 高清预览**与 **HTML 交互式全屏沙盒渲染**。
* 🔊 **小米 MiMo 语音大模型 v2.5 专业级集成** — 自适应、高质感的完整大语言模型语音生成与克隆极客工作台：
  * **模型自适应 AI 语音工坊 (Model-Adaptive Workspace)**：右下角齿轮自动根据当前激活的声音模型，进行完全自适应的工坊面板蜕变：
    * **标准朗读 (`mimo-v2.5-tts`)**：提供冰糖 (默认)、茉莉 (温柔女)、苏打 (活力男)、白桦 (稳重男) 等八大官方预设声线。
    * **声线塑造 (`mimo-v2.5-tts-voicedesign`)**：集成 **“多维度声线构造器”**（性别年龄、嗓音特质、口音等 4 大折叠矩阵，智能拼接 Prompt），支持一键重命名保存为“我的声线库”。
    * **声音克隆 (`mimo-v2.5-tts-voiceclone`)**：集成 **“声音克隆提取器”**，支持内置 🎤 麦克风录音及文件列表打勾，即时以您的音色播报。
  * **呼吸与情感表达插入 (Audio Tag Assistant)**：在输入栏上方一键插入拟真音效标签（`[吸气] 💨`、`[大笑] 😂`、`[叹气] 😮` 等），使播报充满拟真拟人呼吸感。
  * **状态化高级播放与频谱跳跃**：播放时展现高低跳跃的 4 轨声波频谱频谱动画。按钮文本根据就绪状态进行智能变换（`生成并播放 ➡️ 生成中... ➡️ 播放中 ➡️ 播放`），支持单例播放（同一时间全站仅播放一处音频，防止声音重叠）。
  * **持久化 Cache Storage 缓存**：采用 HTML5 规范持久化浏览器缓存技术。刷新页面后，之前生成过的语音能**瞬间秒速加载**并就绪为“播放”状态，不发生任何重复的网络请求或 API Key 额度损耗。
  * **规范化一键下载 (📥)**：就绪后浮现 📥 按钮，智能采用 `mimo-[模型类型]-[随机6位编码].mp3` 规范格式触发本地下载。


---

## 🚀 快速开始

### 📦 桌面端 (Standalone App)

#### ⚙️ 1. 前置依赖准备（重要）
为了能完整使用软件的所有高级功能（例如 **Add Skill / 安装外部技能插件**），您的系统需要安装并配置好 **Git**：
* **常见问题**：如果在添加 Skill 时遇到红色报错 `spawn git ENOENT`，说明您的电脑尚未安装 Git，或者 Git 路径未正确配置到系统的环境变量中。
* **配置步骤**：
  1. 前往 [Git 官方网站](https://git-scm.com/) 下载适用于 Windows 或 macOS 的最新版安装程序。
  2. 安装时，建议选择默认设置（特别注意确保勾选 **"Git from the command line and also from 3rd-party software"**，这会自动将 Git 自动添加至系统环境变量 `PATH` 中）。
  3. 安装完成后，**务必完全退出并重启 Pi Agent xY** 桌面客户端，以便软件重新加载最新的环境变量。

#### 🖥️ 2. Windows 安装与运行
1. 前往 [GitHub Releases](https://github.com/demon820308/Pi-agent-xY/releases) 下载最新生成的 `Pi Agent xY Desktop Setup 0.6.24.exe` 一键安装包。
2. 双击运行 `.exe` 文件，跟随向导完成一键安装。
3. 安装完成后，即可直接通过桌面快捷方式或开始菜单打开客户端。

#### 🍏 3. macOS 安装与运行 (重要)
1. 前往 [GitHub Releases](https://github.com/demon820308/Pi-agent-xY/releases) 下载 `.dmg` 安装包。
2. 双击打开并将应用拖拽至 `Applications` (应用程序) 目录中。

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
# 自动编译 Next.js production 优化包并生成桌面客户端安装包
npm run electron:build
```

> [!NOTE]
> * **离线多媒体支持**：打包配置中已内置对 `ffmpeg-static` 的 `asarUnpack` 设置。构建出的客户端可以在本地独立运行语音合成与解码模块，不依赖 ASAR 内环境。
> * **自动化截图浏览器依赖**：虽然软件支持常规流式抓取 fallback，但设计评审（Design Critic）中网页快照截图及 Deep Research 高级抓取功能需要底层浏览器支持。安装客户端后，请在主系统终端中运行一次 `npx playwright install` 以补全 Chromium 浏览器核心。

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

## 🎬 视频文案提取管线 (Pipeline)

系统内置了“视频/音视频提取文案 ➡️ AI 改写 ➡️ 语音合成”的一站式文案生产管线（可在主界面开启）。支持直接输入视频链接流式提取文案，整个过程在内存中流式处理，不占本地硬盘。

### 1. 支持平台
目前官方支持并提示以下平台的音视频链接（含短链接）：
* 🎬 **抖音** (支持短链、弹窗 Course 视频等特殊链接重写)
* 📺 **B站 (Bilibili)** (自适应 Referer 防盗链)
* 📕 **小红书** (支持小红书视频流解析)

*(注：国外主流平台如 **YouTube** 同样支持直接输入解析)*

### 2. 绕过 B站 412 拦截 (Cookies 配置说明)
由于 B站 近期升级了严格的防爬与 WBI 校验机制，直接解析其链接可能会遭遇 `HTTP 412: Precondition Failed` 错误。

为保障长久稳定使用，本系统集成了**本地 Cookies 文件免锁定免重启自动检测**技术：
1. 在 Chrome/Edge 浏览器中登录你的 B站 账号。
2. 安装浏览器 Cookie 导出插件（如 `Get cookies.txt LOCALLY`），将 B站 的 Cookie 导出为 **Netscape 格式**。
3. 将导出的文本重命名为 `cookies.txt`，直接放置到本项目的**根目录下**（即 `e:\xY\cookies.txt`，与 `package.json` 同级）。
4. 放置后，系统在解析 B站 链接时会自动加载该凭证，完美绕过 B站 的防爬拦截机制。

*(注：抖音、小红书等平台无需任何配置，开箱即用。)*

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
