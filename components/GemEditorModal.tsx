"use client";

import { useState, useEffect } from "react";
import type { GemProfile } from "@/lib/types";

interface GemEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  gemId: string | null;
  onSave: (gem: GemProfile) => void;
  modelList: { id: string; name: string; provider: string }[];
}

const ALL_AVAILABLE_TOOLS = [
  { name: "read", desc: "读取文件内容 (read_file)" },
  { name: "grep", desc: "搜索正则模式 (grep_search)" },
  { name: "find", desc: "查找文件 (find_files)" },
  { name: "ls", desc: "列出目录内容 (list_dir)" },
  { name: "edit", desc: "编辑/替换文件 (replace_file_content)" },
  { name: "write", desc: "新建文件 (write_to_file)" },
  { name: "bash", desc: "运行终端命令 (run_command)" },
];

const PRESET_AVATARS = ["🤖", "💻", "🔍", "🧠", "✍️", "🎨", "🌐", "⚡", "🔧", "📁", "📊", "🚀"];

export default function GemEditorModal({ isOpen, onClose, gemId, onSave, modelList }: GemEditorModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [avatar, setAvatar] = useState("🤖");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [selectedModelKey, setSelectedModelKey] = useState("");
  const [allowedTools, setAllowedTools] = useState<string[]>([]);
  const [knowledgeFiles, setKnowledgeFiles] = useState<string[]>([]);
  const [newFilePath, setNewFilePath] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load Gem-xY profile for editing if gemId is provided
  useEffect(() => {
    if (!isOpen) return;

    if (gemId) {
      setLoading(true);
      setError(null);
      fetch("/api/gem-xy")
        .then((res) => {
          if (!res.ok) throw new Error("Failed to load Gem-xY list");
          return res.json() as Promise<GemProfile[]>;
        })
        .then((gems) => {
          const gem = gems.find((g) => g.id === gemId);
          if (gem) {
            setName(gem.name);
            setDescription(gem.description || "");
            setAvatar(gem.avatar || "🤖");
            setSystemPrompt(gem.systemPrompt);
            setAllowedTools(gem.allowedTools || []);
            setKnowledgeFiles(gem.knowledgeFiles || []);
            if (gem.provider && gem.modelId) {
              setSelectedModelKey(`${gem.provider}/${gem.modelId}`);
            } else {
              setSelectedModelKey("");
            }
          }
          setLoading(false);
        })
        .catch((err) => {
          console.error(err);
          setError("无法加载智能体配置");
          setLoading(false);
        });
    } else {
      // Initialize form for a new Gem-xY
      setName("");
      setDescription("");
      setAvatar("🤖");
      setSystemPrompt("");
      setAllowedTools(ALL_AVAILABLE_TOOLS.map((t) => t.name)); // Enabled all by default
      setKnowledgeFiles([]);
      setSelectedModelKey(modelList.length > 0 ? `${modelList[0].provider}/${modelList[0].id}` : "");
      setError(null);
    }
  }, [isOpen, gemId, modelList]);

  if (!isOpen) return null;

  const handleToolToggle = (toolName: string) => {
    setAllowedTools((prev) =>
      prev.includes(toolName) ? prev.filter((t) => t !== toolName) : [...prev, toolName]
    );
  };

  const addKnowledgeFile = () => {
    if (!newFilePath.trim()) return;
    if (knowledgeFiles.includes(newFilePath.trim())) {
      setNewFilePath("");
      return;
    }
    setKnowledgeFiles((prev) => [...prev, newFilePath.trim()]);
    setNewFilePath("");
  };

  const removeKnowledgeFile = (index: number) => {
    setKnowledgeFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("名称不能为空");
      return;
    }
    if (!systemPrompt.trim()) {
      setError("核心指令不能为空");
      return;
    }

    let provider = "";
    let modelId = "";
    if (selectedModelKey) {
      const parts = selectedModelKey.split("/");
      provider = parts[0];
      modelId = parts[1];
    }

    const payload = {
      ...(gemId ? { id: gemId } : {}),
      name: name.trim(),
      description: description.trim(),
      avatar,
      systemPrompt: systemPrompt.trim(),
      provider,
      modelId,
      allowedTools,
      knowledgeFiles,
    };

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/gem-xy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error || "保存失败");
      }

      const saved = await res.json() as GemProfile;
      onSave(saved);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0, 0, 0, 0.4)",
        backdropFilter: "blur(8px)",
        padding: 20,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 620,
          maxHeight: "85vh",
          background: "var(--bg-panel)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <h2 style={{ margin: 0, fontSize: 16, color: "var(--text)", fontWeight: 600 }}>
            {gemId ? "编辑 Gem-xY 智能体" : "创建全新 Gem-xY 智能体"}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-dim)",
              cursor: "pointer",
              padding: 4,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form Body */}
        <form
          onSubmit={handleSubmit}
          style={{
            padding: 20,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 16,
            flex: 1,
          }}
        >
          {error && (
            <div
              style={{
                padding: "8px 12px",
                background: "rgba(239, 68, 68, 0.15)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                color: "#f87171",
                borderRadius: 6,
                fontSize: 12,
              }}
            >
              {error}
            </div>
          )}

          {loading && !gemId ? (
            <div style={{ padding: 20, textAlign: "center", color: "var(--text-muted)", fontSize: 12 }}>
              保存中...
            </div>
          ) : (
            <>
              {/* Avatar Selector */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>
                  选择头像 (Emoji)
                </label>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 8,
                      background: "var(--bg)",
                      border: "1px solid var(--border)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 24,
                      flexShrink: 0,
                    }}
                  >
                    {avatar}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 4,
                    }}
                  >
                    {PRESET_AVATARS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => setAvatar(emoji)}
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 4,
                          border: avatar === emoji ? "1px solid var(--accent)" : "1px solid transparent",
                          background: avatar === emoji ? "var(--bg-selected)" : "transparent",
                          cursor: "pointer",
                          fontSize: 14,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          transition: "all 0.1s",
                        }}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Name input */}
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>
                  智能体名称 *
                </label>
                <input
                  type="text"
                  required
                  placeholder="例如: Code Analyzer, 英语翻译官"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={{
                    padding: "8px 12px",
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    color: "var(--text)",
                    fontSize: 12,
                    outline: "none",
                  }}
                />
              </div>

              {/* Description input */}
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>
                  功能描述
                </label>
                <input
                  type="text"
                  placeholder="用一句话描述它的专业领域"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  style={{
                    padding: "8px 12px",
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    color: "var(--text)",
                    fontSize: 12,
                    outline: "none",
                  }}
                />
              </div>

              {/* System Prompt Instructions */}
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>
                  核心指令 (System Prompt) *
                </label>
                <textarea
                  required
                  rows={6}
                  placeholder="详细定义智能体的角色、口吻、回复格式以及所需遵循的准则。比如: '你是一个专业的 React 专家，使用简洁的代码逻辑进行回答。'"
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  style={{
                    padding: "8px 12px",
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    color: "var(--text)",
                    fontSize: 12,
                    outline: "none",
                    fontFamily: "inherit",
                    resize: "vertical",
                  }}
                />
              </div>

              {/* Base Model selection */}
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>
                  底层模型 (可选)
                </label>
                <select
                  value={selectedModelKey}
                  onChange={(e) => setSelectedModelKey(e.target.value)}
                  style={{
                    padding: "8px 12px",
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    color: "var(--text)",
                    fontSize: 12,
                    outline: "none",
                  }}
                >
                  <option value="">— 沿用全局默认模型 —</option>
                  {modelList.map((m) => (
                    <option key={`${m.provider}/${m.id}`} value={`${m.provider}/${m.id}`}>
                      {m.name || m.id} ({m.provider})
                    </option>
                  ))}
                </select>
              </div>

              {/* Allowed tools toggles */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>
                  开启工具能力 (禁用可创建纯分析沙箱)
                </label>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 8,
                    background: "var(--bg)",
                    padding: 10,
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                  }}
                >
                  {ALL_AVAILABLE_TOOLS.map((t) => (
                    <label
                      key={t.name}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: 11,
                        color: "var(--text-muted)",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={allowedTools.includes(t.name)}
                        onChange={() => handleToolToggle(t.name)}
                        style={{
                          width: 14,
                          height: 14,
                          accentColor: "var(--accent)",
                          cursor: "pointer",
                        }}
                      />
                      <div>
                        <strong style={{ color: "var(--text)" }}>{t.name}</strong>
                        <span style={{ display: "block", fontSize: 9, color: "var(--text-dim)" }}>
                          {t.desc}
                        </span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* RAG Context Files association */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>
                  关联知识库文件 (读取内容注入上下文)
                </label>
                
                {knowledgeFiles.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      maxHeight: 120,
                      overflowY: "auto",
                      background: "var(--bg)",
                      padding: "8px 10px",
                      borderRadius: 6,
                      border: "1px solid var(--border)",
                    }}
                  >
                    {knowledgeFiles.map((file, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          fontSize: 11,
                          color: "var(--text-muted)",
                          padding: "3px 0",
                        }}
                      >
                        <span style={{ fontFamily: "var(--font-mono)", wordBreak: "break-all", paddingRight: 8 }}>
                          {file}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeKnowledgeFile(idx)}
                          style={{
                            background: "none",
                            border: "none",
                            color: "#ef4444",
                            cursor: "pointer",
                            padding: "0 4px",
                          }}
                        >
                          删除
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="text"
                    placeholder="输入宿主机上文件的绝对路径 (如 D:/rules.md)"
                    value={newFilePath}
                    onChange={(e) => setNewFilePath(e.target.value)}
                    style={{
                      flex: 1,
                      padding: "8px 12px",
                      background: "var(--bg)",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      color: "var(--text)",
                      fontSize: 12,
                      outline: "none",
                    }}
                  />
                  <button
                    type="button"
                    onClick={addKnowledgeFile}
                    style={{
                      padding: "0 14px",
                      background: "var(--bg-hover)",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      color: "var(--text)",
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    添加
                  </button>
                </div>
                <span style={{ fontSize: 10, color: "var(--text-dim)" }}>
                  * 会话启动时将自动读取该路径下的文件内容并与核心指令一并注入上下文。
                </span>
              </div>
            </>
          )}
        </form>

        {/* Footer Actions */}
        <div
          style={{
            padding: "12px 20px",
            borderTop: "1px solid var(--border)",
            background: "var(--bg-hover)",
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "6px 14px",
              background: "none",
              border: "1px solid var(--border)",
              borderRadius: 6,
              color: "var(--text-muted)",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            取消
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={handleSubmit}
            style={{
              padding: "6px 18px",
              background: "var(--accent)",
              border: "none",
              borderRadius: 6,
              color: "#fff",
              fontSize: 12,
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "保存中..." : "保存智能体"}
          </button>
        </div>
      </div>
    </div>
  );
}
