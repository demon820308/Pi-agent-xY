"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface LogLine {
  id: string;
  type: "status" | "query" | "scrape" | "learning" | "progress" | "done" | "error"
    | "scoping" | "planning" | "gap_checking" | "writing";
  text: string;
  timestamp: string;
}

interface DeepResearchPanelProps {
  onClose?: () => void;
  onStateChange?: (state: { isWide: boolean }) => void;
}

interface HistoryMeta {
  id: string;
  query: string;
  timestamp: string;
  model?: { provider: string; modelId: string };
  depth: number;
  breadth: number;
}

export function DeepResearchPanel({ onClose, onStateChange }: DeepResearchPanelProps) {
  const [query, setQuery] = useState("");
  const [depth, setDepth] = useState(2);
  const [breadth, setBreadth] = useState(2);
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [report, setReport] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"preview" | "raw">("preview");
  const [progress, setProgress] = useState<{ depth: number; maxDepth: number } | null>(null);
  const [modelList, setModelList] = useState<{ id: string; name: string; provider: string }[]>([]);
  const [selectedModel, setSelectedModel] = useState<{ provider: string; modelId: string } | null>(null);
  const [historyList, setHistoryList] = useState<HistoryMeta[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // States for interactive styles
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [isInputHovered, setIsInputHovered] = useState(false);
  const [isSelectFocused, setIsSelectFocused] = useState(false);
  const [isSelectHovered, setIsSelectHovered] = useState(false);
  const [isBtnHovered, setIsBtnHovered] = useState(false);

  // Notify AppShell when wide state changes
  const isWide = isRunning || !!report || logs.length > 0 || showHistory;
  useEffect(() => {
    onStateChange?.({ isWide });
  }, [isWide, onStateChange]);

  // Load models on mount
  useEffect(() => {
    fetch("/api/models")
      .then((r) => r.json())
      .then((data) => {
        if (data.modelList) {
          setModelList(data.modelList);
        }
        if (data.defaultModel) {
          setSelectedModel(data.defaultModel);
        }
      })
      .catch((e) => console.error("Failed to load models:", e));
  }, []);
  
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const logsRef = useRef<LogLine[]>([]);

  // Auto-scroll terminal
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // Keep ref in sync for auto-save
  useEffect(() => {
    logsRef.current = logs;
  }, [logs]);

  const addLog = useCallback((type: LogLine["type"], text: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [
      ...prev,
      {
        id: Math.random().toString(36).substring(7),
        type,
        text,
        timestamp: time,
      },
    ]);
  }, []);

  const handleStartResearch = async () => {
    if (!query.trim()) return;

    // Reset state
    setIsRunning(true);
    setLogs([]);
    setReport(null);
    setProgress(null);
    addLog("status", "正在启动深度研究会话...");

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await fetch("/api/deep-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          depth,
          breadth,
          model: selectedModel ? { provider: selectedModel.provider, modelId: selectedModel.modelId } : undefined
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`API 返回了 HTTP 错误 ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("响应体不可读取。");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || ""; // Keep the last incomplete block in buffer

        for (const line of lines) {
          if (!line.trim()) continue;
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.replace("data: ", "")) as {
                type: LogLine["type"];
                message?: string;
                query?: string;
                url?: string;
                learning?: string;
                depth?: number;
                maxDepth?: number;
                report?: string;
              };

              if (data.type === "progress") {
                setProgress({ depth: data.depth || 1, maxDepth: data.maxDepth || 2 });
                addLog("progress", data.message || `正在探索第 ${data.depth} 层递归...`);
              } else if (data.type === "scoping") {
                addLog("scoping", `🎯 ${data.message}`);
              } else if (data.type === "planning") {
                if (data.query) {
                  addLog("query", `🔍 查询: "${data.query}"`);
                } else {
                  addLog("planning", `📋 ${data.message}`);
                }
              } else if (data.type === "gap_checking") {
                addLog("gap_checking", `🔎 ${data.message}`);
              } else if (data.type === "writing") {
                addLog("writing", `✍️ ${data.message}`);
              } else if (data.type === "query") {
                addLog("query", `🔍 查询: "${data.query}"`);
              } else if (data.type === "scrape") {
                addLog("scrape", `📄 抓取页面: ${data.url}`);
              } else if (data.type === "learning") {
                addLog("learning", `💡 发现点: ${data.learning}`);
              } else if (data.type === "done") {
                addLog("done", data.message || "深度研究已完成！");
                setReport(data.report || null);
                if (data.report) {
                  // Auto-save after state updates settle
                  setTimeout(() => autoSaveToHistory(data.report!, logsRef.current), 100);
                }
              } else if (data.type === "error") {
                addLog("error", `❌ 错误: ${data.message}`);
                setIsRunning(false);
              } else if (data.message) {
                addLog(data.type, data.message);
              }
            } catch {
              // ignore parse errors on heartbeat
            }
          }
        }
      }
    } catch (e: any) {
      if (e.name === "AbortError") {
        addLog("status", "用户终止了研究会话。");
      } else {
        addLog("error", `连接丢失: ${e.message || String(e)}`);
      }
    } finally {
      setIsRunning(false);
      abortControllerRef.current = null;
    }
  };

  const handleAbort = () => {
    abortControllerRef.current?.abort();
    setIsRunning(false);
  };

  // ── History Functions ──────────────────────────────────────────────────

  const fetchHistory = useCallback(async () => {
    setIsLoadingHistory(true);
    try {
      const res = await fetch("/api/deep-research/history");
      const data = await res.json();
      setHistoryList(data.entries || []);
    } catch (e) {
      console.error("Failed to fetch history:", e);
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  const handleShowHistory = useCallback(async () => {
    setShowHistory(true);
    await fetchHistory();
  }, [fetchHistory]);

  const handleLoadHistory = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/deep-research/history/${id}`);
      const data = await res.json();
      setQuery(data.query || "");
      setDepth(data.depth || 2);
      setBreadth(data.breadth || 2);
      setLogs(data.logs || []);
      setReport(data.report || null);
      setActiveTab("preview");
      setShowHistory(false);
    } catch (e) {
      console.error("Failed to load history entry:", e);
    }
  }, []);

  const handleDeleteHistory = useCallback(async (id: string, queryText: string) => {
    if (!window.confirm(`确定要删除关于“${queryText}”的历史研究记录吗？\n此操作将永久删除该文件，且不可恢复。`)) {
      return;
    }
    try {
      await fetch(`/api/deep-research/history/${id}`, { method: "DELETE" });
      setHistoryList(prev => prev.filter(e => e.id !== id));
    } catch (e) {
      console.error("Failed to delete history entry:", e);
    }
  }, []);

  const autoSaveToHistory = async (reportText: string, finalLogs: LogLine[]) => {
    const id = `dr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    try {
      await fetch("/api/deep-research/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          query,
          depth,
          breadth,
          model: selectedModel,
          logs: finalLogs,
          report: reportText,
          timestamp: new Date().toISOString(),
        }),
      });
    } catch (e) {
      console.error("Failed to auto-save research:", e);
    }
  };

  const handleCopy = () => {
    if (!report) return;
    navigator.clipboard.writeText(report);
    alert("报告已复制到剪贴板！");
  };

  const handleDownload = () => {
    if (!report) return;
    const match = report.match(/^#\s+(.+)$/m);
    const rawTitle = match ? match[1].trim() : query.trim();
    const cleanTitle = rawTitle.replace(/[\\/:*?"<>|#\r\n]/g, "").replace(/\s+/g, "_").slice(0, 120) || "深度研究报告";
    const blob = new Blob([report], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${cleanTitle}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Clean MD Export ────────────────────────────────────────────────────

  const handleDownloadCleanMD = () => {
    if (!report) return;
    const match = report.match(/^#\s+(.+)$/m);
    const rawTitle = match ? match[1].trim() : query.trim();
    const cleanTitle = rawTitle.replace(/[\\/:*?"<>|#\r\n]/g, "").replace(/\s+/g, "_").slice(0, 120) || "深度研究报告";

    const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g;
    const urlMap = new Map<string, { index: number; title: string }>();
    let counter = 0;

    let temp = report.replace(linkRegex, (_full, text: string, url: string) => {
      if (!urlMap.has(url)) {
        counter++;
        urlMap.set(url, { index: counter, title: text });
      }
      const idx = urlMap.get(url)!.index;
      const anchorText = text === String(idx) ? String(idx) : `${idx}`;
      return `**[${anchorText}](#ref-${idx})**`;
    });

    const refHeadingPattern = /(?:^|\n)##\s*(?:参考文献|References|参考|Sources|Bibliography)\s*\n[\s\S]*$/i;
    temp = temp.replace(refHeadingPattern, "");

    let refBlock = "\n\n---\n\n## References\n\n";
    refBlock += `<table>\n<thead><tr><th>#</th><th>Source</th><th>Title</th></tr></thead>\n<tbody>\n`;
    for (const [url, { index, title }] of urlMap) {
      let domain = url;
      try { domain = new URL(url).hostname.replace(/^www\./, ""); } catch {}
      const favicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
      refBlock += `<tr><td id="ref-${index}" style="text-align:center;font-weight:700">${index}</td>`;
      refBlock += `<td><img src="${favicon}" width="16" height="16" style="vertical-align:middle;margin-right:4px"/><a href="${url}"><strong>${domain}</strong></a></td>`;
      refBlock += `<td>${title}</td></tr>\n`;
    }
    refBlock += `</tbody>\n</table>\n`;

    const finalMd = temp.trimEnd() + refBlock;
    const blob = new Blob([finalMd], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${cleanTitle}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── PDF Export ─────────────────────────────────────────────────────────

  const handleExportPDF = () => {
    const container = document.querySelector(".markdown-body");
    if (!container) return;
    const htmlContent = container.innerHTML;

    const printWin = window.open("", "_blank");
    if (!printWin) return;

    printWin.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${query.trim() || "深度研究报告"}</title>
<style>
  @page { margin: 2cm; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; color: #1a1a1a; line-height: 1.7; font-size: 14px; max-width: 800px; margin: 0 auto; padding: 0 20px; }
  h1 { font-size: 28px; margin-top: 0; page-break-before: avoid; }
  h2 { font-size: 22px; margin-top: 2em; page-break-after: avoid; }
  h3 { font-size: 18px; page-break-after: avoid; }
  table { border-collapse: collapse; width: 100%; margin: 1em 0; page-break-inside: avoid; }
  th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
  th { background: #f5f5f5; font-weight: 600; }
  tr:nth-child(even) { background: #fafafa; }
  a { color: #2563eb; text-decoration: none; }
  img { max-width: 100%; }
  hr { border: none; border-top: 1px solid #ddd; margin: 2em 0; }
  pre { background: #f5f5f5; padding: 12px; border-radius: 6px; overflow-x: auto; font-size: 13px; }
  code { background: #f0f0f0; padding: 1px 4px; border-radius: 3px; font-size: 13px; }
  pre code { background: none; padding: 0; }
  @media print { body { max-width: none; } }
</style></head><body>${htmlContent}</body></html>`);
    printWin.document.close();

    setTimeout(() => {
      printWin.print();
      printWin.close();
    }, 300);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg)", color: "var(--text)", padding: 24, overflowY: "auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {showHistory && (
            <button
              onClick={() => setShowHistory(false)}
              style={{
                display: "flex", alignItems: "center", gap: 4,
                padding: "5px 10px", fontSize: 12, fontWeight: 600,
                background: "none", border: "1px solid var(--border)", borderRadius: 6,
                color: "var(--text-muted)", cursor: "pointer",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
              返回
            </button>
          )}
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: "var(--text)" }}>🔍 深度研究 (Deep Research)</h1>
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "4px 0 0" }}>
              {showHistory ? "浏览历史研究记录。" : "通过递归网页搜索、页面抓取和知识提取，生成详细的 Markdown 分析报告。"}
            </p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {!showHistory && (
            <button
              onClick={handleShowHistory}
              style={{
                display: "flex", alignItems: "center", gap: 4,
                padding: "5px 10px", fontSize: 12, fontWeight: 600,
                background: "none", border: "1px solid var(--border)", borderRadius: 6,
                color: "var(--text-muted)", cursor: "pointer",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              历史记录
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              title="关闭"
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 32, height: 32, padding: 0,
                background: "none", border: "none", borderRadius: "50%",
                color: "var(--text-muted)", cursor: "pointer", transition: "all 0.12s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.color = "var(--text)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "var(--text-muted)"; }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* History List View */}
      {showHistory && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
          {isLoadingHistory ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)", fontSize: 13 }}>加载中...</div>
          ) : historyList.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--text-dim)", fontSize: 13 }}>暂无历史研究记录。</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {historyList.map((entry) => (
                <div
                  key={entry.id}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 8,
                    padding: "12px 16px", cursor: "pointer", transition: "border-color 0.15s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
                >
                  <div
                    style={{ flex: 1, minWidth: 0 }}
                    onClick={() => handleLoadHistory(entry.id)}
                  >
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {entry.query}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4, display: "flex", gap: 12 }}>
                      <span>{new Date(entry.timestamp).toLocaleString()}</span>
                      {entry.model && <span>{entry.model.provider}/{entry.model.modelId}</span>}
                      <span>深度 {entry.depth} / 宽度 {entry.breadth}</span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteHistory(entry.id, entry.query); }}
                    title="删除"
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center",
                      width: 28, height: 28, padding: 0, flexShrink: 0, marginLeft: 12,
                      background: "none", border: "none", borderRadius: 6,
                      color: "var(--text-dim)", cursor: "pointer", transition: "all 0.12s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "#f87171"; e.currentTarget.style.background = "rgba(239,68,68,0.1)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-dim)"; e.currentTarget.style.background = "none"; }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Configuration Form */}
      {!report && !isRunning && !showHistory && (
        <div style={{ background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 12, padding: 24, display: "flex", flexDirection: "column", gap: 20, maxWidth: 800, margin: "10px auto 0", width: "100%" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>研究课题或查询关键字</label>
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setIsInputFocused(true)}
              onBlur={() => setIsInputFocused(false)}
              onMouseEnter={() => setIsInputHovered(true)}
              onMouseLeave={() => setIsInputHovered(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleStartResearch();
                }
              }}
              placeholder="您想深入调查什么课题？例如：分析在高频交易中使用 Rust 与 C++ 的优缺点。"
              rows={3}
              style={{
                padding: 12,
                fontSize: 13,
                background: "var(--bg)",
                border: isInputFocused ? "1px solid var(--accent)" : (isInputHovered ? "1px solid var(--text-muted)" : "1px solid var(--border)"),
                boxShadow: isInputFocused ? "0 0 0 3px rgba(96, 165, 250, 0.2)" : "none",
                borderRadius: 8,
                color: "var(--text)",
                outline: "none",
                resize: "vertical",
                transition: "all 0.15s ease-in-out",
                lineHeight: 1.5,
              }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>选择研究模型</label>
            <select
              value={selectedModel ? `${selectedModel.provider}/${selectedModel.modelId}` : ""}
              onChange={(e) => {
                const [provider, modelId] = e.target.value.split("/");
                setSelectedModel({ provider, modelId });
              }}
              onFocus={() => setIsSelectFocused(true)}
              onBlur={() => setIsSelectFocused(false)}
              onMouseEnter={() => setIsSelectHovered(true)}
              onMouseLeave={() => setIsSelectHovered(false)}
              style={{
                padding: "10px 16px",
                fontSize: 13,
                background: "var(--bg)",
                border: isSelectFocused ? "1px solid var(--accent)" : (isSelectHovered ? "1px solid var(--text-muted)" : "1px solid var(--border)"),
                boxShadow: isSelectFocused ? "0 0 0 3px rgba(96, 165, 250, 0.2)" : "none",
                borderRadius: 8,
                color: "var(--text)",
                outline: "none",
                cursor: "pointer",
                transition: "all 0.15s ease-in-out",
                appearance: "none",
                backgroundImage: `url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23888888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 12px center",
                backgroundSize: "16px",
                paddingRight: "40px",
              }}
            >
              {modelList.map((m) => (
                <option key={`${m.provider}/${m.id}`} value={`${m.provider}/${m.id}`}>
                  {m.provider} - {m.name}
                </option>
              ))}
            </select>
            <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
              为此次深度研究选择要执行推理的智能体模型。
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", display: "flex", justifyContent: "space-between" }}>
                <span>搜索宽度 (每轮查询数)</span>
                <span style={{ color: "var(--accent)" }}>{breadth} 个查询/每轮</span>
              </label>
              <input
                type="range"
                min={1}
                max={5}
                value={breadth}
                onChange={(e) => setBreadth(parseInt(e.target.value))}
                style={{
                  accentColor: "var(--accent)",
                  cursor: "pointer",
                  height: 6,
                  borderRadius: 3,
                  outline: "none",
                  background: "var(--bg)",
                  margin: "8px 0",
                }}
              />
              <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
                在每个递归深度上生成的搜索查询数量。
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", display: "flex", justifyContent: "space-between" }}>
                <span>研究深度 (递归层数)</span>
                <span style={{ color: "var(--accent)" }}>{depth} 层</span>
              </label>
              <input
                type="range"
                min={1}
                max={5}
                value={depth}
                onChange={(e) => setDepth(parseInt(e.target.value))}
                style={{
                  accentColor: "var(--accent)",
                  cursor: "pointer",
                  height: 6,
                  borderRadius: 3,
                  outline: "none",
                  background: "var(--bg)",
                  margin: "8px 0",
                }}
              />
              <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
                递归搜索的层数 (智能体向下钻研的深度)。
              </span>
            </div>
          </div>

          {/* Search Size & Duration Estimator */}
          {(() => {
            const getEstimatedQueries = () => {
              let total = 0;
              let current = 1;
              for (let i = 1; i <= depth; i++) {
                current *= breadth;
                total += current;
              }
              return total;
            };
            const estQueries = getEstimatedQueries();
            const estTimeMin = Math.max(1, Math.round(estQueries * 0.4));
            const estTimeMax = Math.max(2, Math.round(estQueries * 0.8));
            return (
              <div style={{
                background: "var(--bg-subtle)",
                border: "1px dashed var(--border)",
                borderRadius: 8,
                padding: "10px 14px",
                fontSize: 12,
                color: "var(--text-muted)",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}>
                <span style={{ fontSize: 16 }}>💡</span>
                <div>
                  此配置预计会生成约 <strong style={{ color: "var(--accent)" }}>{estQueries}</strong> 个探索查询，
                  深入分析约 <strong style={{ color: "var(--accent)" }}>{estQueries * 2} ~ {estQueries * 3}</strong> 个网页，
                  预计耗时约 <strong style={{ color: "var(--accent)" }}>{estTimeMin} ~ {estTimeMax}</strong> 分钟。
                </div>
              </div>
            );
          })()}

          <button
            onClick={handleStartResearch}
            disabled={!query.trim()}
            onMouseEnter={() => setIsBtnHovered(true)}
            onMouseLeave={() => setIsBtnHovered(false)}
            style={{
              padding: "12px 24px",
              fontSize: 14,
              fontWeight: 600,
              borderRadius: 8,
              border: "none",
              background: query.trim()
                ? "linear-gradient(135deg, var(--accent) 0%, #3b82f6 100%)"
                : "var(--border)",
              color: query.trim() ? "#fff" : "var(--text-dim)",
              cursor: query.trim() ? "pointer" : "not-allowed",
              marginTop: 10,
              transform: query.trim() && isBtnHovered ? "translateY(-1px)" : "none",
              boxShadow: query.trim() && isBtnHovered
                ? "0 4px 12px rgba(37, 99, 235, 0.25)"
                : "none",
              transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          >
            启动深度研究智能体
          </button>
        </div>
      )}

      {/* Running State / Terminal Console */}
      {!showHistory && (isRunning || (logs.length > 0 && !report)) && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16, marginTop: 10, minHeight: 400 }}>
          {/* Progress Indicator */}
          {progress && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, background: "var(--bg-panel)", border: "1px solid var(--border)", padding: "12px 16px", borderRadius: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 600 }}>
                <span>研究进度：第 {progress.depth} 层，共 {progress.maxDepth} 层</span>
                <span>{Math.round((progress.depth / progress.maxDepth) * 100)}%</span>
              </div>
              <div style={{ width: "100%", height: 6, background: "var(--border)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ width: `${(progress.depth / progress.maxDepth) * 100}%`, height: "100%", background: "var(--accent)", borderRadius: 3, transition: "width 0.3s ease" }} />
              </div>
            </div>
          )}

          {/* Console Console window */}
          <div style={{ flex: 1, background: "#0c0d0e", border: "1px solid #1a1c1d", borderRadius: 10, padding: 16, display: "flex", flexDirection: "column", fontFamily: "var(--font-mono)", fontSize: 12, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #222", paddingBottom: 10, marginBottom: 12, flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#ef4444" }} />
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#f59e0b" }} />
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#10b981" }} />
                <span style={{ color: "#888", fontSize: 11, marginLeft: 8 }}>research_agent_terminal.log</span>
              </div>
              {isRunning && (
                <button
                  onClick={handleAbort}
                  style={{
                    padding: "3px 10px",
                    background: "rgba(239,68,68,0.15)",
                    border: "1px solid rgba(239,68,68,0.3)",
                    borderRadius: 4,
                    color: "#f87171",
                    fontSize: 10,
                    fontWeight: 600,
                    cursor: "pointer"
                  }}
                >
                  终止运行
                </button>
              )}
            </div>

            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, color: "#ccc" }}>
              {logs.map((log) => {
                let color = "#aaa";
                if (log.type === "query") color = "#60a5fa";
                if (log.type === "scrape") color = "#fbbf24";
                if (log.type === "learning") color = "#34d399";
                if (log.type === "error") color = "#f87171";
                if (log.type === "progress") color = "#c084fc";
                if (log.type === "scoping") color = "#f472b6";
                if (log.type === "planning") color = "#818cf8";
                if (log.type === "gap_checking") color = "#fb923c";
                if (log.type === "writing") color = "#a78bfa";
                
                return (
                  <div key={log.id} style={{ display: "flex", gap: 8, lineHeight: 1.5, wordBreak: "break-word" }}>
                    <span style={{ color: "#666", flexShrink: 0 }}>[{log.timestamp}]</span>
                    <span style={{ color }}>{log.text}</span>
                  </div>
                );
              })}
              <div ref={terminalEndRef} />
            </div>
          </div>
        </div>
      )}

      {/* Output / Generated Report Viewer */}
      {!showHistory && report && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16, marginTop: 10 }}>
          {/* Action Row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--bg-panel)", border: "1px solid var(--border)", padding: "12px 16px", borderRadius: 8 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setActiveTab("preview")}
                style={{
                  padding: "5px 12px",
                  fontSize: 12,
                  fontWeight: 600,
                  borderRadius: 5,
                  border: "none",
                  background: activeTab === "preview" ? "var(--bg-selected)" : "none",
                  color: activeTab === "preview" ? "var(--text)" : "var(--text-dim)",
                  cursor: "pointer"
                }}
              >
                报告预览
              </button>
              <button
                onClick={() => setActiveTab("raw")}
                style={{
                  padding: "5px 12px",
                  fontSize: 12,
                  fontWeight: 600,
                  borderRadius: 5,
                  border: "none",
                  background: activeTab === "raw" ? "var(--bg-selected)" : "none",
                  color: activeTab === "raw" ? "var(--text)" : "var(--text-dim)",
                  cursor: "pointer"
                }}
              >
                Markdown 源码
              </button>
            </div>

            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button
                onClick={handleCopy}
                style={{ padding: "6px 12px", fontSize: 11, fontWeight: 600, background: "none", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", cursor: "pointer" }}
              >
                复制内容
              </button>
              <button
                onClick={handleDownload}
                style={{ padding: "6px 12px", fontSize: 11, fontWeight: 600, background: "none", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", cursor: "pointer" }}
              >
                下载普通 MD
              </button>
              <button
                onClick={handleDownloadCleanMD}
                style={{ padding: "6px 12px", fontSize: 11, fontWeight: 600, background: "none", border: "1px solid var(--border)", borderRadius: 6, color: "var(--accent)", cursor: "pointer" }}
              >
                下载高颜 MD
              </button>
              <button
                onClick={handleExportPDF}
                style={{ padding: "6px 12px", fontSize: 11, fontWeight: 600, background: "var(--accent)", border: "none", borderRadius: 6, color: "#fff", cursor: "pointer" }}
              >
                导出 PDF 报告
              </button>
              <button
                onClick={() => {
                  setReport(null);
                  setLogs([]);
                }}
                style={{ padding: "6px 12px", fontSize: 11, fontWeight: 600, background: "none", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text-muted)", cursor: "pointer" }}
              >
                新建研究
              </button>
            </div>
          </div>

          {/* Viewer Area */}
          <div style={{ flex: 1, background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 10, padding: 24, overflowY: "auto" }}>
            {activeTab === "preview" ? (
              <div className="markdown-body" style={{ lineHeight: 1.7, fontSize: 14 }}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{report}</ReactMarkdown>
              </div>
            ) : (
              <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text)" }}>
                {report}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
