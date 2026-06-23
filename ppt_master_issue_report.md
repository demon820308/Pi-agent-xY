# PPT Master 自动化生产线未触发问题诊断报告
**PPT Master Automation Pipeline Trigger Diagnosis Report**

## 1. 业务场景与技术架构 (Context & Architecture)

这是一个基于 **Next.js (React) + Python** 的双端 PPT 自动生成系统。

### 预期工作流 (Expected Workflow):
1. **用户输入**：用户在聊天框输入 PPT 主题（例如：“小米汽车崛起的分析报告汇总”）。
2. **大纲规划**：PPT 助手智能体（Agent）接收后，规划 PPT 大纲，并通过工具（`write_to_file`）将大纲内容写入工作区的 `Temp/outline.md`。
3. **信号输出**：Agent 在其回复的最后一行输出特定的启动标识符标签：
   `[START_PPT: Temp/outline.md]`
4. **前端捕获**：前端的 React 组件 [`components/ChatWindow.tsx`](file:///E:/xY/components/ChatWindow.tsx) 监听消息列表，当检测到 Assistant 回复中出现 `[START_PPT: 路径]` 标签时，自动触发后端生成 API：
   `POST /api/ppt/generate`
5. **后台编排**：后端 [`lib/ppt-orchestrator.ts`](file:///E:/xY/lib/ppt-orchestrator.ts) 接收请求，在后台异步拉起 Python 脚本管道（`doc_to_md` ➔ `project_manager` ➔ `confirm_ui` ➔ `finalize_svg` ➔ `svg_to_pptx`）。
6. **进度流渲染**：前端捕获到接口返回 of `sessionId` 后，渲染 `<PptProgressPanel />` 组件，通过 **Server-Sent Events (SSE)** 连接 `/api/ppt/progress/[sessionId]` 实时展示控制台日志 and 进度条。

---

## 2. 当前故障现象 (Current Symptoms)
* **现象**：Agent 成功输出了大纲并输出了 `[START_PPT: Temp/outline.md`，但前端**右侧没有弹出任何进度面板，控制台也没有任何后端 Python 进程被拉起的日志**。
* **特征**：大模型（Agent）输出的标签在末尾经常**缺失了闭合右括号 `]`**（即输出为 `[START_PPT: Temp/outline.md`），这是 LLM 在生成流结束时的常见截断现象。

---

## 3. 已实施的前端修改 (Recent Code Changes Implemented)

针对上述现象，我们已经在 [`components/ChatWindow.tsx`](file:///E:/xY/components/ChatWindow.tsx) 中对触发器 `useEffect` 进行了以下两处代码优化：

### 优化①：解决右括号缺失的正则匹配
* **原正则**：`/\[START_PPT:\s*([^\]]+)\]/`（严格要求以 `]` 结尾）
* **新正则**：`/\[START_PPT:\s*([^\]\s]+)\]?/`（将 `]` 改为可选 `?`，并使用非空白字符集限制匹配范围）。

### 优化②：修复消息唯一标识符（解决 TypeScript 编译报错并防止重复触发）
由于消息数据结构 `AgentMessage` 是一个联合类型，没有直接暴露 `id` 或 `timestamp` 属性。我们改用组件中暴露的 `entryIds`（与 `messages` 对应的 Session 存储实体 ID 数组）来唯一标识消息，以防止会话重载时历史大纲被二次触发。

---

## 4. 关键代码段 (Key Code Snippets)

目前 [`components/ChatWindow.tsx`](file:///E:/xY/components/ChatWindow.tsx) 中负责监听和触发的 React 代码如下：

```typescript
  // Trigger PPT generation if user uploads a document in a PPT session
  const isPptActive = activeGemId === "ppt-master-preset" || session?.gemId === "ppt-master-preset";
  const lastProcessedMsgIdRef = useRef<string | number | null>(null);

  // Initialize the ref to the latest assistant message ID on session load
  useEffect(() => {
    let latestAssistantMsgIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") {
        latestAssistantMsgIdx = i;
        break;
      }
    }
    if (latestAssistantMsgIdx !== -1) {
      lastProcessedMsgIdRef.current = entryIds[latestAssistantMsgIdx] || latestAssistantMsgIdx;
    } else {
      lastProcessedMsgIdRef.current = null;
    }
    setPptSessionId(null);
  }, [session, messages, entryIds]);

  useEffect(() => {
    if (!isPptActive || pptSessionId) return;

    // Find the latest assistant message in the messages list
    let latestAssistantMsgIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") {
        latestAssistantMsgIdx = i;
        break;
      }
    }

    if (latestAssistantMsgIdx !== -1) {
      const latestAssistantMsg = messages[latestAssistantMsgIdx];
      const msgId = entryIds[latestAssistantMsgIdx] || latestAssistantMsgIdx;
      if (msgId && lastProcessedMsgIdRef.current === msgId) {
        return;
      }

      const text = typeof latestAssistantMsg.content === "string"
        ? latestAssistantMsg.content
        : Array.isArray(latestAssistantMsg.content)
          ? latestAssistantMsg.content
              .filter((b: any) => b && typeof b === "object" && b.type === "text")
              .map((b: any) => b.text)
              .join("\n")
          : "";

      // Regular expression matching: [START_PPT: Temp/filename.ext] (optional closing bracket to handle LLM truncation)
      const match = text.match(/\[START_PPT:\s*([^\]\s]+)\]?/);
      if (match) {
        lastProcessedMsgIdRef.current = msgId;
        const sourceFile = match[1].trim();
        const startGen = async () => {
          try {
            const res = await fetch("/api/ppt/generate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                cwd: session?.cwd || newSessionCwd || "",
                sourceFile,
              }),
            });
            const data = await res.json();
            if (data.success && data.sessionId) {
              setPptSessionId(data.sessionId);
            }
          } catch (e) {
            console.error("Failed to start PPT generation:", e);
          }
        };
        startGen();
      }
    }
  }, [messages, entryIds, isPptActive, pptSessionId, session, newSessionCwd]);
```

---

## 5. 待排查的问题猜想 (Potential Diagnostic Directions for ChatGPT)

为什么前端修改了代码后，依然没有触发面板？请帮助分析以下可能性：

1. **Next.js 热更新（HMR）未生效或被阻塞**：
   项目内部分其他模块（如 `open-design` 文件夹中）存在编译期 TypeScript 报错。这是否导致 Next.js Dev Server 的热更新（Fast Refresh）被安全机制拦截，使得浏览器端加载的依然是旧 of JS 缓存包（从而继续使用旧的严格正则匹配）？
2. **`isPptActive` 判定条件在创建新会话后失效**：
   在 [`components/AppShell.tsx`](file:///E:/xY/components/AppShell.tsx) 中：
   * 刚进入新会话（准备输入主题时），`activeGemId === "ppt-master-preset"`，此时 `isPptActive` 为 `true`。
   * 但一旦新会话创建成功，触发了 `handleSessionCreated` ➔ `setActiveGemId(null)`。
   * 此时 `isPptActive` 只能依靠 `session?.gemId === "ppt-master-preset"`。如果创建完会话后后端写入 `.jsonl` 文件的 `gem_info` 还没有在前端 React 的 `session` 状态中同步更新，`isPptActive` 会变为 `false`，导致触发器直接被 `if (!isPptActive) return;` 阻断。
3. **`lastProcessedMsgIdRef` 触发锁失效**：
   在会话加载时，`lastProcessedMsgIdRef` 会被初始化为当前最新的一条 assistant 消息。但在新建会话中，发送第一条消息时，这个逻辑的时序是否在消息追加前就判定了相同，或者在流式传输更新期间被错误地跳过了？
