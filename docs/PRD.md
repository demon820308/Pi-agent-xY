# Pi Agent xY — 产品需求文档 (PRD)

> **版本**: v0.6.14  
> **最后更新**: 2026-05-27  
> **产品状态**: 已发布（npm: @zwbigi/pi-agent-xy）

---

## 1. 产品概述

### 1.1 产品定位

Pi Agent xY 是 **[pi 编码智能体](https://github.com/badlogic/pi-mono) 的 Web 前端界面**，让用户在浏览器中浏览会话、与智能体实时对话、管理分支对话、配置模型和工具，并支持自定义智能体模板。

### 1.2 目标用户

| 用户类型 | 典型场景 |
|----------|----------|
| 开发者 | 使用 pi 编码智能体进行代码编写、调试、重构 |
| 团队 Lead | 浏览历史会话、审查智能体的代码变更过程 |
| 高级用户 | 创建自定义 Gem 智能体（如翻译官、代码审查员） |

### 1.3 核心价值

- **零安装体验** — 
px @zwbigi/pi-agent-xy@latest 一条命令启动
- **可视化会话管理** — 树形分支、会话分组、面包屑导航
- **实时流式交互** — SSE 推送消息、思维链、工具调用过程
- **灵活的智能体定制** — Gem-xY 系统支持自定义系统提示词、模型绑定、工具过滤、知识库文件

---

## 2. 功能需求

### 2.1 会话管理

#### 2.1.1 会话列表

| 需求项 | 描述 |
|--------|------|
| 分组展示 | 按工作目录 (cwd) 分组展示所有历史会话 |
| 树形结构 | 通过 parentSession 字段构建 Fork 父子关系树 |
| 会话信息 | 显示会话名称、创建时间、最后修改时间、消息数、首条消息预览 |
| 孤儿会话标记 | 首行无法解析为有效 header 的会话标记为 orphaned，显示"不完整"徽章 |
| 会话命名 | 支持 session_info 类型的用户自定义名称 |
| 会话删除 | 删除会话文件，级联更新子会话的 parentSession 引用 |
| 会话刷新 | 手动刷新会话列表 |

#### 2.1.2 会话创建

| 需求项 | 描述 |
|--------|------|
| 新建会话 | 选择工作目录 (cwd) → 配置模型/工具/思考级别 → 发送首条消息 |
| 工具预设 | 支持三档预设：Off（无工具）、Low（read/bash/edit/write）、High（全部工具） |
| 模型选择 | 从 models.json 配置中选择 Provider + Model |
| Gem 绑定 | 可选择 Gem-xY 自定义智能体模板创建会话 |

#### 2.1.3 会话 Fork（分叉）

| 需求项 | 描述 |
|--------|------|
| 触发方式 | 点击用户消息上的"Fork"按钮 |
| 行为 | 创建新的独立 .jsonl 文件，在 sidebar 中作为子节点展示 |
| 会话隔离 | Fork 后立即销毁原会话的 AgentSession Wrapper，防止状态污染 |
| 父子关系 | 新会话 header 中记录 parentSession 指向原文件路径 |

#### 2.1.4 会话内分支（In-session Branch）

| 需求项 | 描述 |
|--------|------|
| 触发方式 | 点击"Continue"按钮或通过 BranchNavigator |
| 行为 | 在同一 .jsonl 文件内通过 
avigate_tree 创建新分支 |
| 分支导航器 | 顶部栏展示当前会话的树形分支结构，可视化切换 |
| 上下文切换 | 切换分支时调用 /api/sessions/[id]/context?leafId= 加载对应内容 |

### 2.2 实时对话

#### 2.2.1 消息发送

| 需求项 | 描述 |
|--------|------|
| 消息输入 | 多行文本输入框，支持拖放文件 |
| 发送流程 | POST /api/agent/[id] → startRpcSession() → session.prompt() |
| 会话复用 | 已有 AgentSession 的会话复用连接，无需重建 |
| 并发保护 | 多个 startRpcSession() 调用共享同一个 start Promise |

#### 2.2.2 流式输出 (SSE)

| 需求项 | 描述 |
|--------|------|
| 连接方式 | GET /api/agent/[id]/events 建立 SSE 长连接 |
| 事件类型 | 消息文本、思维链 (thinking)、工具调用 (toolCall)、工具结果 (toolResult) |
| 压缩事件 | 支持 compaction_start/compaction_end 和旧版 uto_compaction_* 两套事件 |
| 断线重连 | 页面刷新时检测 state.isStreaming === true，自动重连 SSE |
| 思考级别同步 | 重连后同步 	hinkingLevel 状态 |

#### 2.2.3 消息渲染

| 需求项 | 描述 |
|--------|------|
| 用户消息 | Markdown 渲染，支持图片内容 |
| 助手消息 | Markdown 渲染 + 代码高亮（react-syntax-highlighter）+ 思维链折叠展示 |
| 工具调用 | 展示工具名称、输入参数，可折叠/展开 |
| 工具结果 | 展示工具输出，区分成功/错误状态 |
| 自定义消息 | 支持 custom 角色的特殊消息类型渲染 |
| 图片支持 | 支持 base64 和 URL 两种图片源 |

#### 2.2.4 交互控制

| 需求项 | 描述 |
|--------|------|
| 中断 (Interrupt) | 打断正在运行的智能体 |
| 追加 (Append) | 在智能体完成后追加新消息 |
| 压缩 (Compact) | 对长会话进行摘要压缩，节省上下文窗口 |
| 思考级别 | 支持 auto / off / minimal / low / medium / high / xhigh 七档切换 |

### 2.3 模型管理

| 需求项 | 描述 |
|--------|------|
| 模型列表 | GET /api/models 返回可用模型列表、默认模型 |
| 默认模型 | 从 ~/.pi/agent/settings.json 读取 |
| 模型配置 | GET/POST /api/models-config 读写 ~/.pi/agent/models.json |
| 对话中切换 | 对话中途随时切换模型，触发 model_change 条目 |
| 配置界面 | ModelsConfig 模态框，可视化编辑 models.json |

### 2.4 工具管理

| 需求项 | 描述 |
|--------|------|
| 三级预设 | Off（无工具）、Default（read/bash/edit/write）、Full（全部 7 种工具） |
| 工具列表 | bash、read、edit、write、grep、find、ls |
| 动态检测 | 会话挂载时通过 get_tools 获取当前活跃工具，推断预设 |
| 无工具模式 | 	oolNames = [] 时注入精简系统提示词 (system-prompt-off.ts) |

### 2.5 Gem-xY 自定义智能体

| 需求项 | 描述 |
|--------|------|
| 创建/编辑 | 可视化编辑器（GemEditorModal），支持头像 emoji、名称、描述、系统提示词 |
| 模型绑定 | 每个 Gem 可绑定不同的 Provider + Model |
| 工具过滤 | 限制 Gem 可访问的工具集（如仅允许只读工具） |
| 知识库文件 | 附加本地文件作为 RAG 上下文，会话时自动加载 |
| 存储位置 | ~/.pi/agent/gem_xy.json |
| CRUD API | GET/POST/PUT/DELETE /api/gem-xy + /api/gem-xy/[id] |

### 2.6 文件浏览

| 需求项 | 描述 |
|--------|------|
| 文件树 | 侧边栏内置 FileExplorer，浏览当前工作目录 |
| 文件查看 | TabBar 中打开文件标签页，查看文件内容 |
| PPTX 预览 | 离线 PPTX 高清渲染，支持全屏缩放 |
| HTML 预览 | 内嵌 iframe 实时预览 HTML 文件，支持全屏缩放 |
| API | GET /api/files/[...path] 返回文件内容 |

### 2.7 认证系统

| 需求项 | 描述 |
|--------|------|
| 多 Provider 登录 | GET/POST /api/auth/login/[provider] |
| 登出 | GET /api/auth/logout/[provider] |
| API Key 管理 | GET/POST /api/auth/api-key/[provider] |
| Provider 列表 | GET /api/auth/providers + /api/auth/all-providers |

### 2.8 Skills 系统

| 需求项 | 描述 |
|--------|------|
| Skill 列表 | GET /api/skills 获取已安装 Skills |
| Skill 搜索 | GET /api/skills/search 搜索可安装的 Skills |
| Skill 安装 | POST /api/skills/install 安装 Skill |
| 配置界面 | SkillsConfig 组件提供可视化管理 |

### 2.9 UI/UX

#### 2.9.1 布局

| 需求项 | 描述 |
|--------|------|
| 三栏布局 | 侧边栏（会话树 + 文件浏览器 + Gem 面板）+ 主内容区（TabBar + ChatWindow）+ 顶部栏 |
| 侧边栏折叠 | 支持展开/收起侧边栏 |
| Tab 管理 | Chat 标签 + 文件标签，支持多标签切换 |
| URL 状态 | 通过 URL searchParams 同步当前会话/文件状态 |

#### 2.9.2 主题

| 需求项 | 描述 |
|--------|------|
| 明暗模式 | CSS Variables 驱动，支持 Light / Dark 切换 |
| 切换动画 | View Transitions API 实现圆形擦除动画 |
| 持久化 | localStorage("pi-theme") 存储用户偏好 |
| 闪烁防护 | <head> 内联脚本在页面渲染前读取主题，防止 FOUC |

#### 2.9.3 其他 UI 特性

| 需求项 | 描述 |
|--------|------|
| 滚动 minimap | ChatMinimap 组件提供消息列表的缩略导航 |
| 会话统计 | 顶部栏展示 Token 用量（input/output/cache）和费用 |
| 上下文用量 | 顶部栏展示上下文窗口使用百分比 |
| 拖放支持 | useDragDrop hook 支持文件拖放到输入框 |
| 音频支持 | useAudio hook 提供音频播放能力 |
| 字体 | Noto Sans Mono（等宽字体），支持拉丁和西里尔字符 |

---

## 3. 技术架构

### 3.1 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Next.js 16 (App Router) + React 19 + TypeScript 5.9 |
| 样式 | Tailwind CSS 4 + CSS Variables |
| Agent 内核 | @earendil-works/pi-coding-agent + @earendil-works/pi-ai |
| Markdown | react-markdown + remark-gfm + react-syntax-highlighter |
| 图表 | chart.js |
| 演示文稿 | pptxviewjs / pptxgenjs |
| 压缩 | jszip |

### 3.2 系统架构

`
浏览器                    Next.js Server                  AgentSession (进程内)
  │                            │                               │
  ├─ GET /api/sessions ────────▶ 读取 ~/.pi/agent/sessions/     │
  ├─ GET /api/sessions/[id]    ▶ 直接解析 .jsonl 文件           │
  │                            │                               │
  ├─ 发送消息 ──────────────────▶ POST /api/agent/[id]          │
  │                            │   startRpcSession() ──────────▶ createAgentSession()
  │                            │   session.send(cmd) ──────────▶ session.prompt()
  │                            │                               │
  ├─ SSE 连接 ──────────────────▶ GET /api/agent/[id]/events    │
  │                            │   session.onEvent() ◀──────────│ session.subscribe()
  │◀──── data: {...} ──────────│                               │
`

### 3.3 数据存储

| 数据 | 格式 | 位置 |
|------|------|------|
| 会话文件 | .jsonl（每行一个 JSON entry） | ~/.pi/agent/sessions/<encoded-cwd>/<timestamp>_<uuid>.jsonl |
| 模型配置 | JSON | ~/.pi/agent/models.json |
| 用户设置 | JSON | ~/.pi/agent/settings.json |
| Gem 模板 | JSON | ~/.pi/agent/gem_xy.json |

### 3.4 会话文件格式 (.jsonl)

`jsonl
{"type":"session","version":3,"id":"<uuid>","timestamp":"...","cwd":"/path","parentSession":"..."}
{"type":"model_change","id":"<8hex>","parentId":null,"provider":"...","modelId":"...","timestamp":"..."}
{"type":"message","id":"<8hex>","parentId":"<8hex>","message":{"role":"user","content":"..."}}
{"type":"message","id":"<8hex>","parentId":"<8hex>","message":{"role":"assistant","content":[...],...}}
{"type":"message","id":"<8hex>","parentId":"<8hex>","message":{"role":"toolResult","toolCallId":"...","content":[...]}}
{"type":"compaction","id":"<8hex>","parentId":"<8hex>","summary":"...","firstKeptEntryId":"<8hex>","tokensBefore":N}
{"type":"session_info","id":"...","parentId":"...","name":"用户自定义名称"}
`

### 3.5 关键设计决策

| 决策 | 原因 |
|------|------|
| globalThis.__piSessions 存储会话 | Next.js HMR 会重置模块级变量，globalThis 在热重载后存活 |
| Fork 后立即销毁 Wrapper | AgentSession.fork() 原地修改 wrapper 内部状态，不销毁会导致后续请求获取错误状态 |
| 两种分支机制 | Fork 创建独立文件（跨会话），Branch 在同一文件内切换（会话内） |
| parentSession 仅作展示 | 不影响聊天内容逻辑，删除时可安全重写整个文件做级联更新 |
| ToolCall 字段规范化 | pi 存储格式与 UI 类型字段名不一致，
ormalizeToolCalls() 统一转换 |

---

## 4. API 接口清单

### 4.1 会话 API

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | /api/sessions | 列出所有会话 |
| GET | /api/sessions/[id] | 获取单个会话详情 |
| PATCH | /api/sessions/[id] | 更新会话（如重命名） |
| DELETE | /api/sessions/[id] | 删除会话 |
| GET | /api/sessions/[id]/context?leafId= | 获取指定分支叶子的上下文 |
| POST | /api/sessions/new | 返回 410（已弃用） |

### 4.2 Agent API

| 方法 | 路径 | 功能 |
|------|------|------|
| POST | /api/agent/new | 创建新会话 { cwd, message, toolNames?, provider?, modelId? } |
| GET | /api/agent/[id] | 获取 Agent 状态（含 streaming/compacting/thinkingLevel） |
| POST | /api/agent/[id] | 发送任意命令到 Agent |
| GET | /api/agent/[id]/events | SSE 事件流 |

### 4.3 模型 API

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | /api/models | 获取 { models, modelList, defaultModel } |
| GET | /api/models-config | 读取 models.json |
| POST | /api/models-config | 写入 models.json |

### 4.4 文件 API

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | /api/files/[...path] | 获取指定路径的文件内容 |

### 4.5 Gem-xY API

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | /api/gem-xy | 列出所有 Gem |
| POST | /api/gem-xy | 创建新 Gem |
| GET | /api/gem-xy/[id] | 获取单个 Gem |
| PUT | /api/gem-xy/[id] | 更新 Gem |
| DELETE | /api/gem-xy/[id] | 删除 Gem |

### 4.6 认证 API

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | /api/auth/providers | 获取可用 Provider 列表 |
| GET | /api/auth/all-providers | 获取所有 Provider 列表 |
| GET/POST | /api/auth/login/[provider] | Provider 登录 |
| GET | /api/auth/logout/[provider] | Provider 登出 |
| GET/POST | /api/auth/api-key/[provider] | 管理 Provider API Key |

### 4.7 Skills API

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | /api/skills | 列出已安装 Skills |
| GET | /api/skills/search | 搜索可安装 Skills |
| POST | /api/skills/install | 安装 Skill |

### 4.8 其他 API

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | /api/default-cwd | 获取默认工作目录 |
| GET | /api/home | 首页信息 |

---

## 5. 非功能需求

### 5.1 性能

| 指标 | 要求 |
|------|------|
| 首屏加载 | SSR + Suspense 渐进式加载 |
| SSE 延迟 | 消息推送延迟 < 100ms |
| 会话列表 | 支持大量会话文件的快速加载 |
| Agent 会话复用 | 已有会话复用连接，避免重复创建 |

### 5.2 可靠性

| 需求 | 描述 |
|------|------|
| 热重载安全 | globalThis 存储关键状态，HMR 不丢失会话 |
| 断线恢复 | 页面刷新自动检测并重连 SSE |
| Idle 超时 | 10 分钟无活动自动销毁 AgentSession，释放资源 |
| 并发安全 | 多请求共享同一会话的 start Promise，避免重复创建 |
| 文件安全 | 孤儿会话标记而非崩溃，优雅降级 |

### 5.3 可扩展性

| 需求 | 描述 |
|------|------|
| 多 Provider | 认证系统支持多 AI Provider 接入 |
| 自定义智能体 | Gem-xY 系统支持无限自定义模板 |
| Skills 插件 | 可安装/搜索第三方 Skills 扩展能力 |
| 工具可配 | 三级工具预设 + 会话级工具过滤 |

### 5.4 可用性

| 需求 | 描述 |
|------|------|
| 零配置启动 | 
px 一条命令即可使用 |
| 暗色模式 | 完整的明暗主题支持，无闪烁切换 |
| 响应式布局 | 侧边栏可折叠，适配不同屏幕 |
| 等宽字体 | Noto Sans Mono，代码阅读体验一致 |

---

## 6. 组件清单

| 组件 | 文件 | 职责 |
|------|------|------|
| AppShell | components/AppShell.tsx | 主布局：URL 状态、Tab 管理、面板协调 |
| SessionSidebar | components/SessionSidebar.tsx | 侧边栏：会话树 + FileExplorer + Gem 面板 |
| ChatWindow | components/ChatWindow.tsx | 聊天区：消息列表 + SSE 流 + Fork/导航逻辑 |
| ChatInput | components/ChatInput.tsx | 输入栏：模型/思考/工具/压缩控件 |
| MessageView | components/MessageView.tsx | 单条消息渲染（用户/助手/工具调用/工具结果） |
| BranchNavigator | components/BranchNavigator.tsx | 会话内分支切换器 |
| ChatMinimap | components/ChatMinimap.tsx | 消息列表滚动缩略导航 |
| ToolPanel | components/ToolPanel.tsx | 工具预设面板（Off/Low/High） |
| ModelsConfig | components/ModelsConfig.tsx | models.json 编辑模态框 |
| SkillsConfig | components/SkillsConfig.tsx | Skills 管理界面 |
| GemEditorModal | components/GemEditorModal.tsx | Gem-xY 自定义智能体编辑器 |
| FileExplorer | components/FileExplorer.tsx | 侧边栏文件树 |
| FileViewer | components/FileViewer.tsx | 文件内容查看（含 PPTX/HTML 预览） |
| FileIcons | components/FileIcons.tsx | 文件类型图标 |
| TabBar | components/TabBar.tsx | 标签栏（Chat + 文件标签） |

---

## 7. Hook 清单

| Hook | 文件 | 职责 |
|------|------|------|
| useAgentSession | hooks/useAgentSession.ts | 智能体会话状态管理 |
| useAudio | hooks/useAudio.ts | 音频播放 |
| useDragDrop | hooks/useDragDrop.ts | 文件拖放支持 |
| useTheme | hooks/useTheme.ts | 明暗主题切换（含 View Transitions 动画） |

---

## 8. 核心库清单

| 库 | 文件 | 职责 |
|------|------|------|
| rpc-manager | lib/rpc-manager.ts | AgentSessionWrapper 生命周期管理 + 会话注册表 |
| session-reader | lib/session-reader.ts | .jsonl 文件解析 + 模型列表/默认模型读取 |
| agent-client | lib/agent-client.ts | 前端 API 请求封装 |
| gem-xy | lib/gem-xy.ts | Gem-xY CRUD 服务 |
| normalize | lib/normalize.ts | ToolCall 字段名规范化 |
| types | lib/types.ts | 共享 TypeScript 类型定义 |
| file-paths | lib/file-paths.ts | 文件路径工具 |
| npx | lib/npx.ts | NPX 相关工具 |
| pi-types | lib/pi-types.ts | pi 内部类型定义 |

---

## 9. 发布与部署

### 9.1 发布方式

`ash
# 开发
npm install && npm run dev    # 端口 30142

# 发布
npm run release               # patch 版本 → build → publish to npm
`

### 9.2 使用方式

`ash
# 零安装
npx @zwbigi/pi-agent-xy@latest

# 全局安装
npm install -g @zwbigi/pi-agent-xy
pi-agent-xy

# 自定义参数
pi-agent-xy --port 8080 --hostname 127.0.0.1
`

### 9.3 环境变量

| 变量 | 说明 |
|------|------|
| PI_CODING_AGENT_DIR | 自定义会话数据目录（默认 ~/.pi/agent/sessions） |
| PORT | 服务端口（默认 30142） |

---

## 10. CSS 设计令牌

`css
/* Light Mode (默认) */
--bg: #ffffff;    --bg-panel: #f5f5f5;  --bg-hover: #eeeeee;
--bg-selected: #e8e8e8;  --border: #e0e0e0;
--text: #1a1a1a;  --text-muted: #6b7280; --text-dim: #9ca3af;
--accent: #2563eb; --accent-hover: #1d4ed8;
--user-bg: #eff6ff; --assistant-bg: #ffffff; --tool-bg: #f9fafb;

/* Dark Mode */
--bg: #1a1a1a;    --bg-panel: #242424;  --bg-hover: #2e2e2e;
--bg-selected: #383838;  --border: #3a3a3a;
--text: #e8e8e8;  --text-muted: #9ca3af; --text-dim: #6b7280;
--accent: #60a5fa; --accent-hover: #93c5fd;
--user-bg: #1e293b; --assistant-bg: #1a1a1a; --tool-bg: #1f2937;
`

---

## 11. 许可证

MIT License
