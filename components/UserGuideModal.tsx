"use client";

import { useState } from "react";

interface UserGuideModalProps {
  onClose: () => void;
}

type TabId = "quick-start" | "branching" | "vision" | "audio" | "ppt" | "design-tools" | "deep-research" | "pipeline" | "geek-config";

interface TabItem {
  id: TabId;
  label: string;
  icon: string;
}

export function UserGuideModal({ onClose }: UserGuideModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>("quick-start");

  const tabs: TabItem[] = [
    { id: "quick-start", label: "快速入门", icon: "🏠" },
    { id: "branching", label: "会话分支与 Fork", icon: "🌳" },
    { id: "vision", label: "智能识图与拦截", icon: "🪄" },
    { id: "audio", label: "MiMo 语音工坊", icon: "🔊" },
    { id: "ppt", label: "PPT 制作助手", icon: "📊" },
    { id: "design-tools", label: "视觉设计与评审", icon: "✂️" },
    { id: "deep-research", label: "深度研究", icon: "🧭" },
    { id: "pipeline", label: "文案提取管线", icon: "🎬" },
    { id: "geek-config", label: "极客面板配置", icon: "⚙️" },
  ];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(15, 23, 42, 0.55)",
        backdropFilter: "blur(20px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: "90%",
          maxWidth: 960,
          height: "78vh",
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.4), 0 10px 10px -5px rgba(0, 0, 0, 0.3)",
          overflow: "hidden",
          color: "var(--text)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 24px",
            borderBottom: "1px solid var(--border)",
            background: "var(--bg-panel)",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 20 }}>🛸</span>
            <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: "0.5px" }}>
              Pi Agent xY 使用指南 & 工作台秘籍
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: 24,
              lineHeight: 1,
              padding: "4px 8px",
              transition: "color 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--text)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--text-muted)";
            }}
          >
            &times;
          </button>
        </div>

        {/* Body Container */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {/* Sidebar Navigation */}
          <div
            style={{
              width: 220,
              borderRight: "1px solid var(--border)",
              background: "var(--bg-panel)",
              display: "flex",
              flexDirection: "column",
              flexShrink: 0,
              padding: "12px 8px",
              overflowY: "auto",
            }}
          >
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 14px",
                    borderRadius: 8,
                    border: "none",
                    background: isActive ? "var(--bg-selected)" : "transparent",
                    color: isActive ? "var(--text)" : "var(--text-muted)",
                    cursor: "pointer",
                    textAlign: "left",
                    fontSize: 13,
                    fontWeight: isActive ? 600 : 500,
                    marginBottom: 4,
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = "var(--bg-hover)";
                      e.currentTarget.style.color = "var(--text)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = "transparent";
                      e.currentTarget.style.color = "var(--text-muted)";
                    }
                  }}
                >
                  <span style={{ fontSize: 16 }}>{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              );
            })}
            <div style={{ flex: 1 }} />
            <div
              style={{
                padding: "8px 12px",
                fontSize: 11,
                color: "var(--text-dim)",
                borderTop: "1px solid var(--border)",
                marginTop: 12,
              }}
            >
              <div>Version: 0.6.24</div>
              <div>OS: Windows Native</div>
            </div>
          </div>

          {/* Content Area */}
          <div
            style={{
              flex: 1,
              padding: "24px 32px",
              overflowY: "auto",
              background: "var(--bg)",
              lineHeight: 1.6,
            }}
          >
            {activeTab === "quick-start" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
                  🏠 快速入门 Pi Agent xY
                </h3>
                <p style={{ margin: 0, fontSize: 14, color: "var(--text-muted)" }}>
                  欢迎使用 <strong>Pi Agent xY</strong>！这是一款专为 Pi Coding Agent 深度定制的高颜值智能工作台，支持桌面客户端与网页端两种使用方式。
                </p>

                <h4 style={{ margin: "8px 0 0 0", fontSize: 14, fontWeight: 600 }}>🖥️ 界面功能区一览</h4>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                  <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 14, background: "var(--bg-panel)" }}>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>📂 左侧面板</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      会话历史树、Gems 专属助手列表、文件浏览器。点击会话即可切换，右键可 Fork 或删除。
                    </div>
                  </div>
                  <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 14, background: "var(--bg-panel)" }}>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>💬 中间主窗口</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      对话消息流、流式输出、工具调用面板、分支导航。顶部工具栏可切换模型、调整推理等级。
                    </div>
                  </div>
                  <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 14, background: "var(--bg-panel)" }}>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>📋 右侧沙盒</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      文件预览、PPTX 演示、图片查看。点击右上角 <strong>◫</strong> 按钮可隐藏/显示此面板。
                    </div>
                  </div>
                </div>

                <h4 style={{ margin: "8px 0 0 0", fontSize: 14, fontWeight: 600 }}>⚡ 顶部工具栏速览</h4>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {[
                    { icon: "🎬", label: "文案管线", desc: "音视频提取与改写" },
                    { icon: "✂️", label: "设计工具", desc: "视觉修改与评审" },
                    { icon: "🌙/☀️", label: "主题切换", desc: "暗色/亮色模式" },
                    { icon: "🌿", label: "分支导航", desc: "同会话多分支切换" },
                  ].map((item) => (
                    <div key={item.label} style={{ flex: "1 1 120px", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", background: "var(--bg-panel)", fontSize: 12 }}>
                      <div style={{ fontWeight: 600 }}>{item.icon} {item.label}</div>
                      <div style={{ color: "var(--text-muted)", marginTop: 2 }}>{item.desc}</div>
                    </div>
                  ))}
                </div>

                <div
                  style={{
                    background: "rgba(99, 102, 241, 0.08)",
                    borderLeft: "4px solid var(--accent)",
                    padding: 12,
                    borderRadius: "0 8px 8px 0",
                    fontSize: 13,
                  }}
                >
                  <strong>💡 小提示：</strong>
                  <div style={{ marginTop: 4, color: "var(--text-muted)" }}>
                    若安装技能插件时遇到 <code>spawn git ENOENT</code> 报错，请先安装 <a href="https://git-scm.com/" target="_blank" rel="noreferrer" style={{ color: "var(--accent)", textDecoration: "underline" }}>Git</a> 并重启客户端。
                  </div>
                </div>
              </div>
            )}

            {activeTab === "branching" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
                  🌳 会话分支浏览与 Fork 决策
                </h3>
                <p style={{ margin: 0, fontSize: 14, color: "var(--text-muted)" }}>
                  Pi Agent xY 支持强大的<strong>非线性对话浏览</strong>与<strong>会话分叉机制</strong>，让您可以无缝追溯历史与开辟新的解决方案分支。
                </p>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 16, background: "var(--bg-panel)" }}>
                    <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8, color: "var(--accent)" }}>🧬 1. 会话分叉 (Fork)</div>
                    <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                      当您在任意用户发言块上方点击 <strong>Fork</strong> 按钮时，系统会从该条历史消息处截断，并创建一个<strong>全新的 <code>.jsonl</code> 会话文件</strong>。
                      <div style={{ marginTop: 6 }}>
                        <em>新会话将作为原会话的“子节点”在侧边栏以树状层级缩进展示，完全不影响原有的对话记录。</em>
                      </div>
                    </div>
                  </div>

                  <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 16, background: "var(--bg-panel)" }}>
                    <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8, color: "var(--accent)" }}>🌿 2. 会话内分支 (Branching)</div>
                    <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                      在对话中如果使用了 Continue 产生多重回复，系统将启动 <code>navigate_tree</code> 分支树。
                      <div style={{ marginTop: 6 }}>
                        您可以通过顶部状态栏上的 <strong>Branches</strong> 导航条实时查看该节点的分支数量（例如 <code>1/3</code>），点击左右箭头即可轻松在不同决策结果间反复横跳切换。
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    background: "rgba(234, 179, 8, 0.08)",
                    borderLeft: "4px solid #eab308",
                    padding: 12,
                    borderRadius: "0 8px 8px 0",
                    fontSize: 13,
                  }}
                >
                  <strong>💡 核心区别：</strong>
                  <div style={{ marginTop: 4, color: "var(--text-muted)" }}>
                    <strong>Fork</strong> 会生成独立的物理会话文件，侧边栏会有缩进树项；<strong>In-session Branching</strong> 共享同一个文件，通过顶部 Branches 菜单进行切换展示。
                  </div>
                </div>
              </div>
            )}

            {activeTab === "vision" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
                  🪄 多模态智能识图与主动防御拦截
                </h3>
                <p style={{ margin: 0, fontSize: 14, color: "var(--text-muted)" }}>
                  系统提供了高水准的图片上传支持，同时配备了完善的提示词反推及智能安全判定。
                </p>

                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 14 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>🔍 视觉模型智能透传与压缩</div>
                    <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                      当选择的模型拥有视觉能力（如 <code>Claude 4.5</code>, <code>Gemini 3.5</code> 等）时，前端会自动对大图进行 Canvas 级别的智能无损压缩，避免超限 token 开销，并将图片底层的 base64 负载直接透传给模型。
                    </div>
                  </div>

                  <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 14, borderColor: "rgba(239, 68, 68, 0.4)", background: "rgba(239, 68, 68, 0.03)" }}>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, color: "#ef4444" }}>🚫 非视觉模型主动防御拦截</div>
                    <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                      对于非视觉模型（如 <code>DeepSeek-R1</code>, <code>DeepSeek-V3</code> 等），如果在输入框中拖入或黏贴图片，<strong>前端机制会在毫秒级进行强制拦截</strong>。系统将拒绝该图片的 payload 写入，并在输入栏正上方弹出红底警示文字。
                      <div style={{ marginTop: 6, fontWeight: 500, color: "var(--text)" }}>
                        💡 好处：彻底规避因不支持视觉的模型接收到图片时产生 API 请求报错，防止会话历史上下文被错误 payload 永久性污染。
                      </div>
                    </div>
                  </div>

                  <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 14 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>🔮 图片反推提示词面板</div>
                    <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                      拖入图片至提示词反推输入框，可一键将其解析反推为结构化文本或 <code>image_prompt</code> JSON 模式，快速作为智能绘图或视觉模型的二次提示词参考。
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "audio" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
                  🔊 小米 MiMo 语音大模型工坊
                </h3>
                <p style={{ margin: 0, fontSize: 14, color: "var(--text-muted)" }}>
                  本项目集成了小米 <strong>MiMo 语音大模型 v2.5</strong>，打造了一套自适应的声音塑造与克隆工作台。
                </p>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12, background: "var(--bg-panel)" }}>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>🎤 声音塑造与克隆矩阵</div>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "var(--text-muted)", display: "flex", flexDirection: "column", gap: 4 }}>
                      <li><strong>标准朗读 (`tts`)</strong>：提供冰糖、白桦等官方 8 大预设声线。</li>
                      <li><strong>声线塑造 (`voicedesign`)</strong>：滑动选择性别、特质、口音矩阵，智能生成声线特征描述词。</li>
                      <li><strong>声音克隆 (`voiceclone`)</strong>：勾选本地录音或上传音频文件，毫秒级模拟并合成克隆声线。</li>
                    </ul>
                  </div>

                  <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12, background: "var(--bg-panel)" }}>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>💨 情感表达插入 (Tag Assistant)</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      在聊天输入栏的上方，集成了一键音效情感标签。点击可以快速将情感拟真标签注入用户输入中：
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                        <span style={{ fontSize: 11, background: "var(--bg)", border: "1px solid var(--border)", padding: "2px 6px", borderRadius: 4 }}>`[吸气]` 💨</span>
                        <span style={{ fontSize: 11, background: "var(--bg)", border: "1px solid var(--border)", padding: "2px 6px", borderRadius: 4 }}>`[大笑]` 😂</span>
                        <span style={{ fontSize: 11, background: "var(--bg)", border: "1px solid var(--border)", padding: "2px 6px", borderRadius: 4 }}>`[叹气]` 😮</span>
                        <span style={{ fontSize: 11, background: "var(--bg)", border: "1px solid var(--border)", padding: "2px 6px", borderRadius: 4 }}>`[咳嗽]` 🤧</span>
                      </div>
                      让模型的语音合成生成高度接近真人呼吸换气的自然感。
                    </div>
                  </div>
                </div>

                <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>🗄️ 高级播放管理与缓存</div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "var(--text-muted)", display: "flex", flexDirection: "column", gap: 4 }}>
                    <li><strong>持久化 Cache 机制</strong>：采用 HTML5 本地持久化缓存，之前生成过的语音再次播放时<strong>瞬时秒加载</strong>，不再向服务器发送重复生成请求，完美杜绝 API 额度浪费。</li>
                    <li><strong>单例播放器管理</strong>：保证全局仅有一处音频处于播放状态，一旦开始播报其他地方，旧音频立即终止静音，防止声音重叠嘈杂。</li>
                    <li><strong>一键标准下载 (📥)</strong>：音频生成后，触发浮现标准下载图标，自动以 <code>mimo-[类型]-[随机码].mp3</code> 规范命名导出。</li>
                  </ul>
                </div>
              </div>
            )}

            {activeTab === "ppt" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
                  📊 PPT 制作助手 (HTML PPT Studio)
                </h3>
                <p style={{ margin: 0, fontSize: 14, color: "var(--text-muted)" }}>
                  一键生成专业演示文稿。AI 自动规划幻灯片结构、排版内容，最终编译为可下载的 <strong>PPTX 文件</strong>。
                </p>

                <h4 style={{ margin: "8px 0 0 0", fontSize: 14, fontWeight: 600 }}>🎯 如何启动</h4>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 14, background: "var(--bg-panel)" }}>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>方式一：点击工具栏 PPT 按钮</div>
                    <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                      在聊天输入框的工具栏中找到 <strong>PPT</strong> 按钮，点击后展开配置面板。
                    </div>
                  </div>
                  <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 14, background: "var(--bg-panel)" }}>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>方式二：切换 PPT 预设智能体</div>
                    <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                      在侧边栏 Gems 列表中选择 <strong>ppt-master-preset</strong> 预设，或点击顶部工具栏的 PPT 专属切换按钮。
                    </div>
                  </div>
                </div>

                <h4 style={{ margin: "8px 0 0 0", fontSize: 14, fontWeight: 600 }}>⚙️ 配置选项</h4>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {[
                    { label: "主题 / 内容简述", desc: '如"2026年度业务规划复盘"' },
                    { label: "受众（可选）", desc: '如"公司高管"、"大众读者"' },
                    { label: "配色主题", desc: "如 Tokyo Night 等暗色/亮色方案" },
                    { label: "模板风格", desc: "针对不同场景的排版模板" },
                    { label: "期望页数", desc: "控制幻灯片总页数" },
                  ].map((item) => (
                    <div key={item.label} style={{ border: "1px solid var(--border)", borderRadius: 6, padding: "8px 12px", fontSize: 12 }}>
                      <strong>{item.label}</strong>
                      <div style={{ color: "var(--text-muted)", marginTop: 2 }}>{item.desc}</div>
                    </div>
                  ))}
                </div>

                <h4 style={{ margin: "8px 0 0 0", fontSize: 14, fontWeight: 600 }}>🔄 生成流程</h4>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-muted)" }}>
                  <span style={{ background: "var(--accent)", color: "#fff", padding: "3px 10px", borderRadius: 12, fontSize: 12, fontWeight: 600 }}>1</span> 填写配置并提交
                  <span style={{ color: "var(--text-dim)" }}>→</span>
                  <span style={{ background: "var(--accent)", color: "#fff", padding: "3px 10px", borderRadius: 12, fontSize: 12, fontWeight: 600 }}>2</span> AI 规划结构 & 逐页 SVG 排版
                  <span style={{ color: "var(--text-dim)" }}>→</span>
                  <span style={{ background: "var(--accent)", color: "#fff", padding: "3px 10px", borderRadius: 12, fontSize: 12, fontWeight: 600 }}>3</span> 编译导出 PPTX 文件
                </div>

                <div
                  style={{
                    background: "rgba(234, 179, 8, 0.08)",
                    borderLeft: "4px solid #eab308",
                    padding: 12,
                    borderRadius: "0 8px 8px 0",
                    fontSize: 13,
                  }}
                >
                  <strong>💡 预览与下载：</strong>
                  <div style={{ marginTop: 4, color: "var(--text-muted)" }}>
                    生成过程中可在右侧文件沙盒中实时查看 SVG 排版效果。编译完成后，PPTX 文件将自动出现在文件面板中，支持在线预览与一键下载。
                  </div>
                </div>
              </div>
            )}

            {activeTab === "design-tools" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
                  ✂️ 视觉设计与评审工具 (Design Tools)
                </h3>
                <p style={{ margin: 0, fontSize: 14, color: "var(--text-muted)" }}>
                  点击顶部工具栏的 <strong>✂️</strong> 图标，即可打开专业的视觉交互控制台。包含四大功能页签：
                </p>

                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 14 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, color: "var(--accent)" }}>📸 手动微调 (Manual Edit)</div>
                    <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                      拖入界面截图或输入页面 URL 自动截屏，然后直接在图片上<strong>框选</strong>有问题的区域，在框旁写下修改意见（如&ldquo;按钮间距调大&rdquo;、&ldquo;主色调换成蓝色&rdquo;）。AI 会根据您的选框和要求定位代码并自动修正。
                      <div style={{ marginTop: 6, fontWeight: 500, color: "var(--text)" }}>
                        也支持直接上传 HTML 源码文件，在代码中标注修改区域。
                      </div>
                    </div>
                  </div>

                  <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 14 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, color: "var(--accent)" }}>🚀 整体复刻 (UI Replica)</div>
                    <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                      提供一个心仪网站的截图或链接，指定要适配的设计规范（如特定组件库、配色规范），AI 会自动编写代码在沙盒中复现该界面。支持两种模式：
                      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                        <span style={{ fontSize: 11, background: "var(--bg)", border: "1px solid var(--border)", padding: "2px 8px", borderRadius: 4 }}>🎨 高保真 (Hi-Fi)</span>
                        <span style={{ fontSize: 11, background: "var(--bg)", border: "1px solid var(--border)", padding: "2px 8px", borderRadius: 4 }}>📐 线框图 (Wireframe)</span>
                      </div>
                    </div>
                  </div>

                  <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 14 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, color: "var(--accent)" }}>🧲 网站复刻 (Clone Page)</div>
                    <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                      输入目标网页 URL，系统自动抓取页面截图并进行整体复刻。支持选择输出语言（中文/英文）和目标文件路径，适合快速复制已有页面的布局和元素。
                    </div>
                  </div>

                  <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 14 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, color: "var(--accent)" }}>🔍 设计评审 (Design Critique)</div>
                    <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                      上传页面图片或输入 URL 后，大模型会像专业的 UI 体验官一样，对页面的<strong>美观度、排版间距、人机工学可用性</strong>进行全面打分，列出设计缺陷并提供一键修改建议。
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "deep-research" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
                  🧭 深度研究 (Deep Research)
                </h3>
                <p style={{ margin: 0, fontSize: 14, color: "var(--text-muted)" }}>
                  专门用于解决<strong>复杂知识检索与系统化报告生成</strong>的问题。在聊天输入框左侧的工具箱菜单中点击 <strong>Deep Research</strong> 即可启动。
                </p>

                <h4 style={{ margin: "8px 0 0 0", fontSize: 14, fontWeight: 600 }}>📝 使用步骤</h4>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 14, background: "var(--bg-panel)" }}>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>1. 输入研究课题</div>
                    <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                      如&ldquo;2026年全球新能源电池技术突破与瓶颈&rdquo;、&ldquo;AI 编程助手市场格局分析&rdquo;等。
                    </div>
                  </div>
                  <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 14, background: "var(--bg-panel)" }}>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>2. 设定搜索参数</div>
                    <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                      调整<strong>搜索深度 (Depth)</strong>与<strong>搜索广度 (Breadth)</strong>，并选择执行推理的智能体模型。
                    </div>
                  </div>
                  <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 14, background: "var(--bg-panel)" }}>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>3. 启动并等待</div>
                    <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                      点击启动后，系统在后台自动完成：多步骤规划 → 全网搜索与抓取 → 信息查漏补缺 → 生成系统化报告。
                    </div>
                  </div>
                </div>

                <h4 style={{ margin: "8px 0 0 0", fontSize: 14, fontWeight: 600 }}>📊 实时日志与报告管理</h4>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 14 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>🖥️ 实时终端日志</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      控制台实时显示机器人当前任务进度，如&ldquo;正在阅读某某网页…&rdquo;、&ldquo;正在补充搜索…&rdquo;等。
                    </div>
                  </div>
                  <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 14 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>📚 历史报告库</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      所有生成过的研究报告自动保存在&ldquo;历史记录&rdquo;中，支持随时查看、重新导出 Markdown 或删除。
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    background: "rgba(99, 102, 241, 0.08)",
                    borderLeft: "4px solid var(--accent)",
                    padding: 12,
                    borderRadius: "0 8px 8px 0",
                    fontSize: 13,
                  }}
                >
                  <strong>💡 报告输出：</strong>
                  <div style={{ marginTop: 4, color: "var(--text-muted)" }}>
                    最终报告以格式化 Markdown 呈现，支持在右侧预览面板中直接阅读，也可一键导出为独立文件。
                  </div>
                </div>
              </div>
            )}

            {activeTab === "pipeline" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
                  🎬 音视频文案提取与生产管线 (Pipeline)
                </h3>
                <p style={{ margin: 0, fontSize: 14, color: "var(--text-muted)" }}>
                  Pi Agent xY 内置了一键式的“音视频提取文案 ➡️ AI 二次改写 ➡️ 语音大模型重播生成”的视频创作者管线。
                </p>

                <div style={{ display: "flex", alignItems: "center", gap: 10, border: "1px solid var(--border)", padding: "10px 14px", borderRadius: 8, background: "var(--bg-panel)" }}>
                  <span style={{ fontSize: 16 }}>🔗</span>
                  <span style={{ fontSize: 13 }}>
                    <strong>支持平台：</strong> 抖音 (短链接与 Course 弹窗课)、B站 (Bilibili)、小红书、YouTube 等主流音视频平台。
                  </span>
                </div>

                <h4 style={{ margin: "8px 0 0 0", fontSize: 14, fontWeight: 600, color: "var(--accent)" }}>🛡️ 突破 B站 412: Precondition Failed 封锁</h4>
                <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>
                  Bilibili 具备极严格的 WBI 与请求风控校验。为了保持长期稳定的提取率，系统集成了 <strong>Cookies 自动检测热重载</strong> 逻辑：
                </p>

                <div
                  style={{
                    background: "var(--bg-panel)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: 16,
                    fontSize: 13,
                  }}
                >
                  <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
                    <li>在电脑 Chrome 或 Edge 浏览器上正常登录您的 B 站账号。</li>
                    <li>使用类似 <code>Get cookies.txt LOCALLY</code> 的浏览器插件，将 Cookie 导出为 <strong>Netscape 格式</strong> 文本。</li>
                    <li>将该文本重命名为 <code>cookies.txt</code>，直接复制并放置于项目根目录下（即 <code>e:\xY\cookies.txt</code> ）。</li>
                    <li>系统检测到该文件后会自动读取凭证，在发出请求时进行 Referer 与 Cookie 自适应装配，实现 100% 稳定解析绕过。</li>
                  </ol>
                </div>
              </div>
            )}

            {activeTab === "geek-config" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
                  ⚙️ 极客面板配置
                </h3>
                <p style={{ margin: 0, fontSize: 14, color: "var(--text-muted)" }}>
                  系统提供了极高的客制化自由度，您可以通过以下文件或可视化面板定制您的开发工作台。
                </p>

                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 14 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span>🤖 Gem-xY 可视化自定义智能体生态</span>
                      <code style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>~/.pi/agent/gem_xy.json</code>
                    </div>
                    <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 6 }}>
                      点击侧边栏的 <strong>Gems</strong> 项或 “+” 号，即可在可视化弹窗中新增或修改预设智能体。支持 Emoji 头像定制、独立 System Prompt、指定可用工具及关联 RAG 知识库，从而使其在特定的开发场景中具备专属超能力。
                    </div>
                  </div>

                  <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 14 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span>🔑 可视化编辑可用模型清单</span>
                      <code style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>~/.pi/agent/models.json</code>
                    </div>
                    <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 6 }}>
                      点击侧边栏最底部的 <strong>Models Settings</strong> 按钮即可打开模型管理配置面版。您可以方便地绑定各个大模型供应商的 API 密钥、开启/关闭指定模型、或者录入国内的中转中继模型端点。
                    </div>
                  </div>

                  <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 14 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>🛸 会话底层记录与回档</div>
                    <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 6 }}>
                      所有的对话会话以 <code>.jsonl</code> 格式保存在本地 <code>~/.pi/agent/sessions/&lt;encoded-cwd&gt;/</code> 文件夹中。如果您发现对话意外错乱，可以直接打开对应的 <code>.jsonl</code> 删除多余的消息行，系统再次加载时将自动重绘最新的状态。
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
