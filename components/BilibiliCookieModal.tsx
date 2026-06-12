"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";

interface BilibiliCookieModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function BilibiliCookieModal({ isOpen, onClose }: BilibiliCookieModalProps) {
  const [cookieStatus, setCookieStatus] = useState<{ exists: boolean; mtime?: string; source?: string } | null>(null);
  const cookieInputRef = useRef<HTMLInputElement>(null);

  const checkCookieStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/pipeline/cookies");
      if (res.ok) {
        const data = await res.json();
        setCookieStatus(data);
      }
    } catch (e) {
      console.error("Failed to fetch cookie status:", e);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      checkCookieStatus();
    }
  }, [isOpen, checkCookieStatus]);

  const handleCookieUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      if (!content) return;

      try {
        const res = await fetch("/api/pipeline/cookies", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ content }),
        });

        if (res.ok) {
          await checkCookieStatus();
          alert("cookies.txt 上传成功！");
        } else {
          const errData = await res.json();
          alert("上传失败: " + (errData.error || "未知错误"));
        }
      } catch (err) {
        console.error("Error uploading cookies:", err);
        alert("上传出错: " + String(err));
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleCookieDelete = async () => {
    if (!confirm("确定要清除已保存的 B站 Cookie 吗？")) return;
    try {
      const res = await fetch("/api/pipeline/cookies", {
        method: "DELETE",
      });
      if (res.ok) {
        await checkCookieStatus();
        alert("Cookie 已成功清除！");
      } else {
        const errData = await res.json();
        alert("清除失败: " + (errData.error || "未知错误"));
      }
    } catch (err) {
      console.error("Error deleting cookies:", err);
      alert("清除出错: " + String(err));
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      background: "rgba(0, 0, 0, 0.45)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 9999, padding: 16,
      animation: "fadeIn 0.2s ease-out",
    }}>
      <div style={{
        background: "var(--bg-panel)",
        border: "1px solid var(--border)",
        borderRadius: 16,
        width: "100%",
        maxWidth: 480,
        boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
        display: "flex",
        flexDirection: "column",
        animation: "scaleIn 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)",
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          display: "flex",
          borderBottom: "1px solid var(--border)",
          background: "rgba(255,255,255,0.02)",
          padding: "16px 20px",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text)" }}>
            ⚙️ B站 Cookie 配置
          </span>
          <button
            onClick={onClose}
            style={{
              background: "none", border: "none", color: "var(--text-muted)",
              cursor: "pointer", display: "flex", alignItems: "center", padding: 4,
              borderRadius: "50%", transition: "background 0.15s",
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg-hover)"}
            onMouseLeave={(e) => e.currentTarget.style.background = "none"}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Status Section */}
          <div style={{
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            padding: 12,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
              <span style={{ fontSize: 13, color: "var(--text-muted)", flexGrow: 1 }}>当前状态：</span>
              {cookieStatus === null ? (
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>正在获取...</span>
              ) : cookieStatus.exists ? (
                <span style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#10B981",
                  background: "rgba(16, 185, 129, 0.1)",
                  border: "1px solid rgba(16, 185, 129, 0.25)",
                  padding: "2px 8px",
                  borderRadius: 12,
                }}>
                  已配置 ({cookieStatus.source === "local" ? "项目目录" : "用户目录"})
                </span>
              ) : (
                <span style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--text-muted)",
                  background: "var(--bg-hover)",
                  border: "1px solid var(--border)",
                  padding: "2px 8px",
                  borderRadius: 12,
                }}>
                  未配置
                </span>
              )}
            </div>

            {cookieStatus?.exists && cookieStatus.mtime && (
              <div style={{ fontSize: 12, color: "var(--text-dim)", display: "flex", flexDirection: "column", gap: 4 }}>
                <div>更新时间：{new Date(cookieStatus.mtime).toLocaleString("zh-CN")}</div>
              </div>
            )}
          </div>

          {/* Instructions */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>操作指南：</div>
            <div style={{
              fontSize: 12,
              color: "var(--text-muted)",
              lineHeight: "1.6",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}>
              <div>1. 视频下载与提取功能需要 B站 Netscape 格式的 Cookie。</div>
              <div>2. 建议在浏览器安装 Cookie 导出插件，例如：
                <a 
                  href="https://chromewebstore.google.com/detail/get-cookiestxt-locally/ccmkkkkclimpcobnhblolbjodopihjdc" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  style={{ color: "var(--accent)", textDecoration: "underline", marginLeft: 4 }}
                >
                  Get cookies.txt LOCALLY
                </a>
              </div>
              <div>3. 浏览器中登录 B站，然后打开插件，将 Bilibili 的 cookie 以 Netscape 格式导出为 <code>cookies.txt</code> 文件。</div>
              <div>4. 点击下方上传按钮，选择导出的文件即可。</div>
            </div>
          </div>
        </div>

        {/* Footer / Actions */}
        <div style={{
          padding: "16px 20px",
          borderTop: "1px solid var(--border)",
          background: "rgba(255,255,255,0.01)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
        }}>
          <div>
            {cookieStatus?.exists && (
              <button
                onClick={handleCookieDelete}
                style={{
                  padding: "8px 12px",
                  background: "rgba(239, 68, 68, 0.1)",
                  border: "1px solid rgba(239, 68, 68, 0.2)",
                  borderRadius: 8,
                  color: "#EF4444",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 500,
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = "rgba(239, 68, 68, 0.18)"}
                onMouseLeave={(e) => e.currentTarget.style.background = "rgba(239, 68, 68, 0.1)"}
              >
                清除配置
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={() => cookieInputRef.current?.click()}
              style={{
                padding: "8px 16px",
                background: "var(--accent)",
                border: "none",
                borderRadius: 8,
                color: "#fff",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
                transition: "filter 0.15s",
              }}
              onMouseEnter={(e) => e.currentTarget.style.filter = "brightness(1.1)"}
              onMouseLeave={(e) => e.currentTarget.style.filter = "none"}
            >
              上传 cookies.txt
            </button>
            <button
              onClick={onClose}
              style={{
                padding: "8px 16px",
                background: "var(--bg-hover)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                color: "var(--text-muted)",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 500,
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg-selected)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "var(--bg-hover)"}
            >
              关闭
            </button>
          </div>
        </div>
      </div>
      <input
        type="file"
        accept=".txt"
        ref={cookieInputRef}
        onChange={handleCookieUpload}
        style={{ display: "none" }}
      />
    </div>
  );
}
