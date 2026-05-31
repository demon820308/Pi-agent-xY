"use client";

import React, { useState, useEffect } from "react";
import { isBaseTtsModel, isVoiceDesignModel, isVoiceCloneModel, isTtsModel } from "@/lib/tts-utils";

export interface TtsPanelProps {
  model: { provider: string; modelId: string } | null | undefined;
  attachedFiles: { file: File; name: string; size: number }[];
  voiceConsoleOpen: boolean;
  setVoiceConsoleOpen: (open: boolean) => void;
  insertAudioTag: (tag: string) => void;
}

export function TtsPanel({
  model,
  attachedFiles,
  voiceConsoleOpen,
  setVoiceConsoleOpen,
  insertAudioTag,
}: TtsPanelProps) {
  const isTts = model ? isTtsModel(model.provider, model.modelId) : false;

  // Model-Adaptive Voice Workspace States
  const [presetVoice, setPresetVoice] = useState("mimo_default");
  const [voiceDesignPrompt, setVoiceDesignPrompt] = useState("");
  const [voiceDesignActiveChips, setVoiceDesignActiveChips] = useState<string[]>([]);
  const [voiceCloneActiveFile, setVoiceCloneActiveFile] = useState<string | null>(null);
  const [voiceCloneAudioData, setVoiceCloneAudioData] = useState<string | null>(null);
  const [voiceDesignLibrary, setVoiceDesignLibrary] = useState<{ name: string; prompt: string; chips: string[] }[]>([]);
  const [isSavingTimbre, setIsSavingTimbre] = useState(false);
  const [newTimbreName, setNewTimbreName] = useState("");

  // Load voice settings on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem("mimo_voice_settings");
      if (stored) {
        const settings = JSON.parse(stored);
        if (settings.presetVoice) setPresetVoice(settings.presetVoice);
        if (settings.voiceDesignPrompt) setVoiceDesignPrompt(settings.voiceDesignPrompt);
        if (settings.voiceDesignActiveChips) setVoiceDesignActiveChips(settings.voiceDesignActiveChips);
        if (settings.voiceCloneActiveFile) setVoiceCloneActiveFile(settings.voiceCloneActiveFile);
        if (settings.voiceCloneAudioData) setVoiceCloneAudioData(settings.voiceCloneAudioData);
      }
      
      const libStored = localStorage.getItem("mimo_voice_design_library");
      if (libStored) {
        setVoiceDesignLibrary(JSON.parse(libStored));
      } else {
        const defaultLib = [
          { name: "👑 金牌客服", prompt: "A sweet young female voice with clear, sweet texture, gentle and patient temperament, speaking standard Mandarin.", chips: ["青年女 👩", "清脆甜美 🍬", "温柔耐心 🌸", "标准国语"] },
          { name: "🎙️ 知性主播", prompt: "A thirty-year-old mature female voice with intellectual, calm, and composed presenter temperament, speaking standard Mandarin.", chips: ["青年女 👩", "富有磁性 🧲", "知性稳重 📚", "标准国语"] },
          { name: "📖 故事说书人", prompt: "A middle-aged male voice with husky, deep, and magnetic texture, nostalgic and storytelling vibe, speaking standard Mandarin.", chips: ["大叔男 🧔", "深沉低沉 🎙️", "慵懒随性 ☕", "标准国语"] }
        ];
        localStorage.setItem("mimo_voice_design_library", JSON.stringify(defaultLib));
        setVoiceDesignLibrary(defaultLib);
      }
    } catch (e) {
      console.error("Failed to load mimo voice settings:", e);
    }
  }, []);

  // Save voice settings on change
  useEffect(() => {
    try {
      const settings = {
        presetVoice,
        voiceDesignPrompt,
        voiceDesignActiveChips,
        voiceCloneActiveFile,
        voiceCloneAudioData
      };
      localStorage.setItem("mimo_voice_settings", JSON.stringify(settings));
      window.dispatchEvent(new Event("mimo_voice_settings_changed"));
    } catch (e) {
      console.error("Failed to save mimo voice settings:", e);
    }
  }, [presetVoice, voiceDesignPrompt, voiceDesignActiveChips, voiceCloneActiveFile, voiceCloneAudioData]);

  // Help translate designer chips into natural English prompts
  const compilePromptFromChips = (chips: string[]) => {
    if (chips.length === 0) return "";
    const translations: Record<string, string> = {
      "青年女 👩": "young female voice",
      "青年男 👨": "young male voice",
      "大叔男 🧔": "mature middle-aged male voice",
      "幼态少女 👧": "lively young girl voice",
      "白发老者 👴": "elderly grandfather male voice",
      "沙哑 🍂": "husky and raspy vocal texture",
      "清脆甜美 🍬": "crisp and sweet vocal texture",
      "富有磁性 🧲": "magnetic and charming voice",
      "深沉低沉 🎙️": "deep and low-pitched vocal texture",
      "浑厚中气 🔊": "full-bodied and resonant voice",
      "知性稳重 📚": "intellectual, calm, and composed presenter temperament",
      "温柔耐心 🌸": "gentle, soft, and extremely patient temperament",
      "阳光活泼 ☀️": "bright, energetic, and highly enthusiastic temperament",
      "严肃冷酷 ❄️": "stern, cold, and serious tone",
      "慵懒随性 ☕": "lazy, relaxed, and casual conversational tone",
      "标准国语": "speaking standard Mandarin",
      "川普口音": "speaking standard Mandarin with a charming Sichuan dialect accent",
      "粤普口音": "speaking standard Mandarin with a subtle Cantonese dialect accent",
      "东北口音": "speaking standard Mandarin with a noticeable Northeast dialect accent",
      "英普口音": "speaking standard Mandarin with a slight English accent"
    };
    
    const translated = chips.map(c => translations[c] || c);
    return `A beautiful ${translated.join(", ")}.`;
  };

  // Removed old prompt-based saveCurrentTimbre in favor of direct inline workspace saving

  const deleteSavedTimbre = (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`确定要删除自定义音色 "${name}" 吗？`)) {
      const newLib = voiceDesignLibrary.filter(item => item.name !== name);
      setVoiceDesignLibrary(newLib);
      localStorage.setItem("mimo_voice_design_library", JSON.stringify(newLib));
    }
  };

  const selectFileForCloning = (file: File, fileName: string) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result && typeof e.target.result === "string") {
        let result = e.target.result;
        // If it is recorded webm audio, trans-label the base64 prefix to audio/wav 
        // to bypass strict Xiaomi voice clone format restrictions.
        if (result.startsWith("data:audio/webm;")) {
          result = result.replace("data:audio/webm;", "data:audio/wav;");
        }
        setVoiceCloneAudioData(result);
        setVoiceCloneActiveFile(fileName);
      }
    };
    reader.readAsDataURL(file);
  };

  if (!isTts) return null;

  const modelIdStr = model?.modelId || "";
  const isBaseTts = isBaseTtsModel(model?.provider, modelIdStr);
  const isVoiceDesign = isVoiceDesignModel(model?.provider, modelIdStr);
  const isVoiceClone = isVoiceCloneModel(model?.provider, modelIdStr);

  return (
    <>
      {/* Tag Assistant */}
      <div style={{
        display: "flex",
        gap: 6,
        marginBottom: 6,
        alignItems: "center",
        flexWrap: "wrap",
        background: "rgba(var(--accent-rgb), 0.03)",
        padding: "6px 10px",
        borderRadius: 8,
        border: "1px solid var(--border)"
      }}>
        <span style={{ fontSize: 10, color: "var(--text-dim)", fontWeight: 600 }}>💨 音频标签助手：</span>
        {[
          { label: "吸气", tag: "inhale", icon: "💨" },
          { label: "大笑", tag: "laughter", icon: "😂" },
          { label: "叹气", tag: "sigh", icon: "😮‍💨" },
          { label: "啜泣", tag: "sob", icon: "😢" },
          { label: "咳嗽", tag: "cough", icon: "😷" }
        ].map(t => (
          <button
            key={t.tag}
            type="button"
            onClick={() => insertAudioTag(t.tag)}
            style={{
              padding: "2px 8px",
              borderRadius: 4,
              fontSize: 10,
              border: "1px solid var(--border)",
              background: "var(--bg-panel)",
              color: "var(--text-muted)",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 2,
              transition: "all 0.12s"
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.color = "var(--text)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "var(--bg-panel)"; e.currentTarget.style.color = "var(--text-muted)"; }}
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
        <span style={{ fontSize: 9, color: "var(--text-dim)", marginLeft: "auto" }}>
          点击在光标处插入标签
        </span>
      </div>

      {/* Voice Workspace Popover Panel */}
      {voiceConsoleOpen && (
        <div style={{
          marginBottom: 10,
          padding: 16,
          background: "var(--bg-panel)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          transition: "all 0.2s ease-in-out"
        }}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", display: "flex", alignItems: "center", gap: 6 }}>
              🎙️ AI 声音工坊
              <span style={{ fontSize: 11, fontWeight: 400, color: "var(--accent)", background: "rgba(var(--accent-rgb), 0.1)", padding: "1px 6px", borderRadius: 4 }}>
                {isBaseTts && "标准朗读模式"}
                {isVoiceDesign && "自定义声线塑造"}
                {isVoiceClone && "高真声音克隆"}
              </span>
            </span>
            <button 
              type="button"
              onClick={() => setVoiceConsoleOpen(false)}
              style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 11 }}
            >
              收起 ✕
            </button>
          </div>

          {/* 1. Base TTS Preset Selection */}
          {isBaseTts && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>请选择内置高质感官方声线：</span>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {[
                  { name: "冰糖 🍬 (国语女)", id: "mimo_default" },
                  { name: "茉莉 🌸 (温柔女)", id: "茉莉" },
                  { name: "苏打 🥛 (活力男)", id: "苏打" },
                  { name: "白桦 🌲 (稳重男)", id: "白桦" },
                  { name: "Chloe 🇬🇧 (英音女)", id: "Chloe" },
                  { name: "Mia 🇺🇸 (美音女)", id: "Mia" },
                  { name: "Milo 🇨🇦 (美音男)", id: "Milo" },
                  { name: "Dean 🦘 (澳音男)", id: "Dean" }
                ].map(v => {
                  const isActive = presetVoice === v.id;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setPresetVoice(v.id)}
                      style={{
                        padding: "4px 10px",
                        borderRadius: 6,
                        fontSize: 11,
                        border: isActive ? "1px solid var(--accent)" : "1px solid var(--border)",
                        background: isActive ? "var(--bg-selected)" : "none",
                        color: isActive ? "var(--text)" : "var(--text-muted)",
                        cursor: "pointer",
                        fontWeight: isActive ? 600 : 400,
                        transition: "all 0.12s"
                      }}
                      onMouseEnter={e => { if(!isActive) e.currentTarget.style.background = "var(--bg-hover)"; }}
                      onMouseLeave={e => { if(!isActive) e.currentTarget.style.background = "none"; }}
                    >
                      {v.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 2. Voice Design Console */}
          {isVoiceDesign && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {/* Template Library */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
                  <span>👑 我的声线库：</span>
                  {isSavingTimbre ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <input
                        type="text"
                        value={newTimbreName}
                        onChange={(e) => setNewTimbreName(e.target.value)}
                        placeholder="输入音色名称..."
                        autoFocus
                        style={{
                          padding: "2px 6px",
                          fontSize: 10.5,
                          borderRadius: 4,
                          border: "1px solid var(--accent)",
                          background: "var(--bg)",
                          color: "var(--text)",
                          outline: "none",
                          width: 120
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (newTimbreName.trim()) {
                            const newLib = [...voiceDesignLibrary, { name: newTimbreName.trim(), prompt: voiceDesignPrompt, chips: voiceDesignActiveChips }];
                            setVoiceDesignLibrary(newLib);
                            localStorage.setItem("mimo_voice_design_library", JSON.stringify(newLib));
                            setNewTimbreName("");
                            setIsSavingTimbre(false);
                          }
                        }}
                        style={{
                          background: "var(--accent)",
                          border: "none",
                          color: "#fff",
                          fontSize: 10,
                          padding: "2px 6px",
                          borderRadius: 4,
                          cursor: "pointer"
                        }}
                      >
                        确认
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setNewTimbreName("");
                          setIsSavingTimbre(false);
                        }}
                        style={{
                          background: "none",
                          border: "1px solid var(--border)",
                          color: "var(--text-dim)",
                          fontSize: 10,
                          padding: "2px 6px",
                          borderRadius: 4,
                          cursor: "pointer"
                        }}
                      >
                        取消
                      </button>
                    </div>
                  ) : (
                    <button 
                      type="button"
                      onClick={() => setIsSavingTimbre(true)} 
                      disabled={!voiceDesignPrompt}
                      style={{ 
                        background: "none", 
                        border: "none", 
                        color: voiceDesignPrompt ? "var(--accent)" : "var(--text-dim)", 
                        fontSize: 11, 
                        cursor: voiceDesignPrompt ? "pointer" : "not-allowed", 
                        fontWeight: 600 
                      }}
                    >
                      ＋ 保存当前声线组合
                    </button>
                  )}
                </span>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {voiceDesignLibrary.map((item, idx) => {
                    const isActive = voiceDesignPrompt === item.prompt;
                    return (
                      <div
                        key={idx}
                        onClick={() => {
                          setVoiceDesignPrompt(item.prompt);
                          setVoiceDesignActiveChips(item.chips);
                        }}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          padding: "3px 8px",
                          borderRadius: 6,
                          fontSize: 11,
                          border: isActive ? "1px solid var(--accent)" : "1px solid var(--border)",
                          background: isActive ? "var(--bg-selected)" : "none",
                          color: isActive ? "var(--text)" : "var(--text-muted)",
                          cursor: "pointer",
                          transition: "all 0.12s"
                        }}
                      >
                        <span>{item.name}</span>
                        {idx >= 3 && (
                          <span 
                            onClick={(e) => deleteSavedTimbre(item.name, e)}
                            style={{ color: "var(--text-dim)", marginLeft: 4, fontSize: 10, cursor: "pointer" }}
                            title="删除此声线"
                          >
                            ✕
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Timbre Matrix Constructor */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: "1px dashed var(--border)", paddingTop: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>🧩 声线塑造魔方（自由勾选实时拼装）：</span>
                
                {[
                  {
                    title: "性别年龄",
                    chips: ["青年女 👩", "青年男 👨", "大叔男 🧔", "幼态少女 👧", "白发老者 👴"]
                  },
                  {
                    title: "嗓音特质",
                    chips: ["沙哑 🍂", "清脆甜美 🍬", "富有磁性 🧲", "深沉低沉 🎙️", "浑厚中气 🔊"]
                  },
                  {
                    title: "性格气质",
                    chips: ["知性稳重 📚", "温柔耐心 🌸", "阳光活泼 ☀️", "严肃冷酷 ❄️", "慵懒随性 ☕"]
                  },
                  {
                    title: "语言口音",
                    chips: ["标准国语", "川普口音", "粤普口音", "东北口音", "英普口音"]
                  }
                ].map(cat => (
                  <div key={cat.title} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{ fontSize: 10, color: "var(--text-dim)", width: 55, flexShrink: 0 }}>{cat.title}：</span>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {cat.chips.map(chip => {
                        const isSelected = voiceDesignActiveChips.includes(chip);
                        return (
                          <button
                            key={chip}
                            type="button"
                            onClick={() => {
                              let nextChips: string[];
                              if (isSelected) {
                                nextChips = voiceDesignActiveChips.filter(c => c !== chip);
                              } else {
                                const otherCategoryChips = cat.chips.filter(c => c !== chip);
                                nextChips = voiceDesignActiveChips.filter(c => !otherCategoryChips.includes(c));
                                nextChips.push(chip);
                              }
                              setVoiceDesignActiveChips(nextChips);
                              setVoiceDesignPrompt(compilePromptFromChips(nextChips));
                            }}
                            style={{
                              padding: "2px 8px",
                              borderRadius: 4,
                              fontSize: 10,
                              border: isSelected ? "1px solid var(--accent)" : "1px solid var(--border)",
                              background: isSelected ? "var(--bg-selected)" : "none",
                              color: isSelected ? "var(--text)" : "var(--text-muted)",
                              cursor: "pointer",
                              transition: "all 0.12s"
                            }}
                          >
                            {chip}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Prompt Preview */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6, borderTop: "1px dashed var(--border)", paddingTop: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>📝 生成的声线描述 (Timbre Prompt)：</span>
                <textarea
                  value={voiceDesignPrompt}
                  onChange={(e) => setVoiceDesignPrompt(e.target.value)}
                  rows={2}
                  placeholder="点击上方魔方自动组装声线，或在此手动撰写..."
                  style={{
                    width: "100%",
                    padding: 8,
                    fontSize: 11,
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                    background: "var(--bg)",
                    color: "var(--text)",
                    fontFamily: "var(--font-mono)",
                    resize: "none"
                  }}
                />
              </div>
            </div>
          )}

          {/* 3. Voice Clone Reference Selection */}
          {isVoiceClone && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>🔊 声线克隆提取器 (Voice Clone Source)：</span>
              {(() => {
                const audioFiles = attachedFiles.filter(f => 
                  f.name.endsWith(".wav") || 
                  f.name.endsWith(".webm") || 
                  f.name.endsWith(".mp3") || 
                  f.name.endsWith(".m4a")
                );

                if (audioFiles.length === 0) {
                  return (
                    <div style={{
                      padding: "16px 12px",
                      border: "1px dashed var(--border)",
                      borderRadius: 8,
                      fontSize: 11,
                      color: "var(--text-muted)",
                      textAlign: "center",
                      lineHeight: "1.6"
                    }}>
                      💡 请先在左下角点击麦克风 🎤 录制您的声音，或点击别针 📎 上传一段录音（WAV/MP3），然后在此选中它以提取克隆声线！
                    </div>
                  );
                }

                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{ fontSize: 10, color: "var(--text-dim)" }}>检测到已上传的音频附件，点击指定为当前克隆声源：</span>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {audioFiles.map((fileObj, idx) => {
                        const isSelected = voiceCloneActiveFile === fileObj.name;
                        return (
                          <div
                            key={idx}
                            onClick={() => selectFileForCloning(fileObj.file, fileObj.name)}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              padding: "6px 12px",
                              borderRadius: 6,
                              border: isSelected ? "1px solid #10b981" : "1px solid var(--border)",
                              background: isSelected ? "rgba(16,185,129,0.06)" : "none",
                              cursor: "pointer",
                              transition: "all 0.15s"
                            }}
                          >
                            <span style={{ fontSize: 11, color: "var(--text)", fontWeight: isSelected ? 600 : 400 }}>
                              {fileObj.name}
                            </span>
                            <span style={{ fontSize: 10, color: isSelected ? "#10b981" : "var(--text-muted)" }}>
                              {isSelected ? "✓ 已选定为克隆声源" : "点击提取"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}
    </>
  );
}
