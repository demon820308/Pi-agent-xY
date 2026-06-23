import React, { useEffect, useState, useRef } from "react";
import type { PptProgress } from "@/lib/ppt-orchestrator";

interface Props {
  sessionId: string;
  onComplete: (pptxPath: string) => void;
  onClose: () => void;
  onProjectPathResolved?: (path: string) => void;
  onStateChange?: (state: PptProgress) => void;
}

export function PptProgressPanel({ sessionId, onComplete, onClose, onProjectPathResolved, onStateChange }: Props) {
  const [sessionState, setSessionState] = useState<PptProgress | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [showConsole, setShowConsole] = useState(false);
  const consoleEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const eventSource = new EventSource(`/api/ppt/progress/${sessionId}`);

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === "init" || payload.type === "update") {
          const s = payload.session as PptProgress;
          setSessionState(s);
          setLogs(s.logs || []);
          if (s.projectPath && onProjectPathResolved) {
            onProjectPathResolved(s.projectPath);
          }
          if (onStateChange) {
            onStateChange(s);
          }
          if (s.step === "completed" && s.pptxPath) {
            onComplete(s.pptxPath);
            eventSource.close();
          }
        } else if (payload.type === "log") {
          setLogs((prev) => [...prev, payload.log]);
        } else if (payload.type === "error") {
          setSessionState({
            sessionId,
            step: "error",
            percent: 0,
            logs: [],
            error: payload.error || "PPT progress stream failed",
          });
          eventSource.close();
        }
      } catch (e) {
        console.error("Error processing SSE message:", e);
      }
    };

    eventSource.onerror = () => {
      setSessionState((prev) => prev ?? {
        sessionId,
        step: "error",
        percent: 0,
        logs: [],
        error: "PPT progress stream disconnected.",
      });
      eventSource.close();
    };

    return () => eventSource.close();
  }, [sessionId, onComplete]);

  useEffect(() => {
    if (showConsole) {
      consoleEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, showConsole]);

  if (!sessionState) return <div style={{ fontSize: 13, color: "var(--text-muted)", padding: 12 }}>初始化进度流...</div>;

  const steps = [
    { id: "extracting", name: "文档内容提取" },
    { id: "init", name: "排版项目初始化" },
    { id: "confirming", name: "规划设计规范 (Confirm UI)" },
    { id: "waiting_design", name: "设计排版页面 (AI 智能体)" },
    { id: "finalizing", name: "编译排版页面" },
    { id: "exporting", name: "导出 PPTX" },
    { id: "completed", name: "完成导出 PPTX" },
  ];

  const currentStepIdx = steps.findIndex((x) => x.id === sessionState.step);

  return (
    <div style={{
      background: "var(--bg-panel)",
      border: "1px solid var(--border)",
      borderRadius: 12,
      padding: 20,
      boxShadow: "0 10px 25px rgba(0,0,0,0.15)",
      marginTop: 12,
      marginBottom: 12,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "var(--text)" }}>📊 PPT 排版大师生产线</h3>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}>✕</button>
      </div>

      {/* Progress Bar */}
      <div style={{ background: "var(--border)", height: 8, borderRadius: 4, overflow: "hidden", marginBottom: 20 }}>
        <div style={{
          background: sessionState.step === "error" ? "#f87171" : "var(--accent)",
          width: `${sessionState.percent}%`,
          height: "100%",
          transition: "width 0.4s ease-in-out"
        }} />
      </div>

      {/* Steps Timeline */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
        {steps.map((s, idx) => {
          const isDone = sessionState.step === "completed" || (currentStepIdx !== -1 && idx < currentStepIdx);
          const isActive = sessionState.step === s.id && s.id !== "completed";
          const isFailed = sessionState.step === "error" && idx === currentStepIdx;

          return (
            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 20,
                height: 20,
                borderRadius: "50%",
                background: isDone ? "#10b981" : isFailed ? "#ef4444" : isActive ? "var(--accent)" : "var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                color: "#fff",
                fontWeight: 600
              }}>
                {isDone ? "✓" : isFailed ? "✕" : idx + 1}
              </div>
              <span style={{
                fontSize: 13,
                color: isActive ? "var(--text)" : isFailed ? "#f87171" : "var(--text-muted)",
                fontWeight: isActive ? 600 : 400
              }}>
                {s.name}
                {isActive && " (正在运行)"}
                {isFailed && " (出错)"}
              </span>
            </div>
          );
        })}
      </div>

      {sessionState.error && (
        <div style={{
          padding: 12,
          background: "rgba(239, 68, 68, 0.1)",
          border: "1px solid rgba(239, 68, 68, 0.2)",
          borderRadius: 6,
          color: "#f87171",
          fontSize: 12,
          marginBottom: 16,
          whiteSpace: "pre-wrap",
        }}>
          {sessionState.error}
        </div>
      )}

      {/* Console Toggle */}
      <button
        onClick={() => setShowConsole(!showConsole)}
        style={{
          width: "100%",
          background: "none",
          border: "1px solid var(--border)",
          padding: "8px 12px",
          borderRadius: 6,
          fontSize: 12,
          cursor: "pointer",
          textAlign: "left",
          display: "flex",
          justifyContent: "space-between",
          color: "var(--text-muted)",
        }}
      >
        <span>实时终端输出日志</span>
        <span>{showConsole ? "收起 ▲" : "展开 ▼"}</span>
      </button>

      {/* Terminal logs viewer */}
      {showConsole && (
        <div style={{
          marginTop: 10,
          background: "#0f172a",
          color: "#e2e8f0",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          padding: 12,
          borderRadius: 6,
          maxHeight: 180,
          overflowY: "auto",
          whiteSpace: "pre-wrap",
        }}>
          {logs.map((log, i) => <div key={i}>{log}</div>)}
          <div ref={consoleEndRef} />
        </div>
      )}
    </div>
  );
}
