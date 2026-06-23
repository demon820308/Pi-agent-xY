"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { SkillSearchResult } from "@/app/api/skills/search/route";

interface Skill {
  name: string;
  description: string;
  filePath: string;
  baseDir: string;
  disableModelInvocation: boolean;
  sourceInfo: {
    source?: string;
    scope?: string;
  };
}

function shortenPath(p: string): string {
  // Match common home dir patterns: /Users/xxx, /home/xxx
  return p.replace(/^\/(?:Users|home)\/[^/]+/, "~");
}

function sourceLabel(skill: Skill): string {
  if (skill.filePath.startsWith("virtual:") || skill.filePath === "built-in:agent-skills" || skill.sourceInfo?.source === "virtual") return "virtual";
  const src = skill.sourceInfo?.source;
  if (src === "built-in") return "built-in";
  const scope = skill.sourceInfo?.scope;
  if (scope === "user" || src === "user") return "global";
  if (scope === "project" || src === "project") return "project";
  return "path";
}

function Toggle({
  enabled,
  loading,
  onToggle,
}: {
  enabled: boolean;
  loading: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      disabled={loading}
      title={
        enabled
          ? "Visible in model prompt — click to disable"
          : "Hidden from model prompt — click to enable"
      }
      style={{
        flexShrink: 0,
        width: 40,
        height: 22,
        borderRadius: 11,
        border: "none",
        padding: 0,
        cursor: loading ? "wait" : "pointer",
        background: enabled ? "var(--accent)" : "var(--border)",
        position: "relative",
        transition: "background 0.18s",
        outline: "none",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 3,
          left: enabled ? 21 : 3,
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "var(--bg)",
          boxShadow: "0 1px 4px rgba(0,0,0,0.22)",
          transition: "left 0.18s cubic-bezier(.4,0,.2,1)",
        }}
      />
    </button>
  );
}

function SkillDetail({
  skill,
  cwd,
  onToggle,
  toggling,
  saveError,
}: {
  skill: Skill;
  cwd: string;
  onToggle: (skill: Skill) => void;
  toggling: boolean;
  saveError: string | null;
}) {
  const label = sourceLabel(skill);
  const enabled = !skill.disableModelInvocation;
  const isVirtual = skill.filePath.startsWith("virtual:");
  const providerId = isVirtual ? skill.filePath.replace("virtual:", "") : "";

  const [keyConfigured, setKeyConfigured] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [savingKey, setSavingKey] = useState(false);

  useEffect(() => {
    if (isVirtual) {
      setKeyInput("");
      fetch(`/api/auth/api-key/${providerId}`)
        .then((res) => res.json())
        .then((d) => {
          setKeyConfigured(!!d.configured);
        })
        .catch(() => {});
    }
  }, [skill.filePath, isVirtual, providerId]);

  function displayPath(p: string): string {
    if (isVirtual) return "built-in integration";
    if (label === "project" && p.startsWith(cwd)) {
      const rel = p.slice(cwd.length).replace(/^[/\\]/, "");
      return `./${rel}`;
    }
    return shortenPath(p);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Path + tag + toggle */}
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <span
          style={{
            fontSize: 10,
            padding: "1px 5px",
            borderRadius: 3,
            flexShrink: 0,
            background:
              label === "project"
                ? "rgba(99,102,241,0.12)"
                : label === "built-in"
                  ? "rgba(34,197,94,0.12)"
                  : label === "virtual"
                    ? "rgba(168,85,247,0.12)"
                    : "rgba(120,120,120,0.12)",
            color:
              label === "project" 
                ? "rgba(99,102,241,0.8)" 
                : label === "built-in"
                  ? "rgba(34,197,94,0.8)"
                  : label === "virtual"
                    ? "rgba(168,85,247,0.8)"
                    : "var(--text-dim)",
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--text-dim)",
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {displayPath(skill.filePath)}
        </span>
        <Toggle
          enabled={enabled}
          loading={toggling}
          onToggle={() => onToggle(skill)}
        />
        {saveError && (
          <span style={{ fontSize: 12, color: "#f87171", flexShrink: 0 }}>
            {saveError}
          </span>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <span
          style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}
        >
          Name
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 14,
            color: "var(--text)",
          }}
        >
          {skill.name}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <span
          style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}
        >
          Description
        </span>
        <span
          style={{ fontSize: 14, color: "var(--text-muted)", lineHeight: 1.6 }}
        >
          {skill.description}
        </span>
      </div>

      {isVirtual && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
          <span
            style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}
          >
            API Key Config
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder={keyConfigured ? "••••••••••••••••" : "Enter API Key..."}
              style={{
                flex: 1,
                padding: "6px 9px",
                background: "var(--bg-panel)",
                border: "1px solid var(--border)",
                borderRadius: 5,
                color: "var(--text)",
                fontSize: 12,
                outline: "none",
                fontFamily: "var(--font-mono)",
              }}
            />
            <button
              onClick={async () => {
                if (!keyInput.trim()) return;
                setSavingKey(true);
                try {
                  const res = await fetch(`/api/auth/api-key/${providerId}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ apiKey: keyInput.trim() }),
                  });
                  if (res.ok) {
                    setKeyConfigured(true);
                    setKeyInput("");
                  }
                } catch (e) {
                  console.error(e);
                } finally {
                  setSavingKey(false);
                }
              }}
              disabled={savingKey || !keyInput.trim()}
              style={{
                padding: "6px 12px",
                fontSize: 12,
                borderRadius: 5,
                border: "none",
                background: keyInput.trim() ? "var(--accent)" : "var(--border)",
                color: keyInput.trim() ? "#fff" : "var(--text-dim)",
                cursor: keyInput.trim() ? "pointer" : "not-allowed",
                fontWeight: 600,
              }}
            >
              {savingKey ? "Saving…" : "Save"}
            </button>
            {keyConfigured && (
              <button
                onClick={async () => {
                  try {
                    const res = await fetch(`/api/auth/api-key/${providerId}`, {
                      method: "DELETE",
                    });
                    if (res.ok) {
                      setKeyConfigured(false);
                      setKeyInput("");
                    }
                  } catch (e) {
                    console.error(e);
                  }
                }}
                style={{
                  padding: "5px 12px",
                  fontSize: 12,
                  borderRadius: 5,
                  border: "1px solid rgba(239,68,68,0.3)",
                  background: "none",
                  color: "#ef4444",
                  cursor: "pointer",
                }}
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AddSkillPanel({
  cwd,
  onInstalled,
}: {
  cwd: string;
  onInstalled: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SkillSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);
  const [installedPkgs, setInstalledPkgs] = useState<Set<string>>(new Set());
  const [scope, setScope] = useState<"global" | "project">("global");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setSearching(true);
    setSearchError(null);
    setResults([]);
    try {
      const res = await fetch("/api/skills/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q.trim() }),
      });
      const d = (await res.json()) as {
        results?: SkillSearchResult[];
        error?: string;
      };
      if (d.error) {
        setSearchError(d.error);
        return;
      }
      setResults(d.results ?? []);
      if ((d.results ?? []).length === 0) setSearchError("No skills found");
    } catch (e) {
      setSearchError(String(e));
    } finally {
      setSearching(false);
    }
  }, []);

  const install = useCallback(
    async (pkg: string) => {
      setInstalling(pkg);
      setInstallError(null);
      try {
        const res = await fetch("/api/skills/install", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ package: pkg, scope, cwd }),
        });
        const d = (await res.json()) as { success?: boolean; error?: string };
        if (!res.ok || d.error) {
          setInstallError(d.error ?? `HTTP ${res.status}`);
          return;
        }
        setInstalledPkgs((prev) => new Set(prev).add(pkg));
        onInstalled();
      } catch (e) {
        setInstallError(String(e));
      } finally {
        setInstalling(null);
      }
    },
    [onInstalled, scope, cwd],
  );

  const installPath =
    scope === "global"
      ? "~/.pi/agent/skills/"
      : `${shortenPath(cwd)}/.pi/agent/skills/`;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* ── Header area ── */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          marginBottom: 20,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>
          Add Skill
        </div>

        {/* Search row */}
        <div style={{ display: "flex", gap: 8 }}>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") search(query);
            }}
            placeholder="e.g. react, testing, deploy"
            style={{
              flex: 1,
              padding: "7px 10px",
              fontSize: 13,
              background: "var(--bg-panel)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              color: "var(--text)",
              outline: "none",
            }}
          />
          <button
            onClick={() => search(query)}
            disabled={searching || !query.trim()}
            style={{
              padding: "7px 16px",
              fontSize: 13,
              borderRadius: 6,
              border: "none",
              background: "var(--accent)",
              color: "#fff",
              cursor: searching || !query.trim() ? "not-allowed" : "pointer",
              opacity: searching || !query.trim() ? 0.5 : 1,
              flexShrink: 0,
            }}
          >
            {searching ? "Searching…" : "Search"}
          </button>
        </div>

        {/* Scope + install path row */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              display: "flex",
              borderRadius: 5,
              border: "1px solid var(--border)",
              overflow: "hidden",
              fontSize: 12,
              flexShrink: 0,
            }}
          >
            {(["global", "project"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setScope(s)}
                style={{
                  padding: "3px 10px",
                  border: "none",
                  cursor: "pointer",
                  background: scope === s ? "var(--bg-selected)" : "none",
                  color: scope === s ? "var(--text)" : "var(--text-dim)",
                  fontWeight: scope === s ? 600 : 400,
                  borderRight:
                    s === "global" ? "1px solid var(--border)" : "none",
                }}
              >
                {s}
              </button>
            ))}
          </div>
          <span
            style={{
              fontSize: 12,
              color: "var(--text-dim)",
              fontFamily: "var(--font-mono)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            → {installPath}
          </span>
        </div>

        {/* Errors */}
        {searchError && (
          <div style={{ fontSize: 12, color: "#f87171" }}>{searchError}</div>
        )}
        {installError && (
          <div
            style={{ fontSize: 12, color: "#f87171", wordBreak: "break-word" }}
          >
            {installError}
          </div>
        )}
      </div>

      {/* ── Results list ── */}
      {results.length > 0 ? (
        <div style={{ flex: 1, overflowY: "auto" }}>
          {results.map((r) => {
            const isInstalled = installedPkgs.has(r.package);
            const isInstalling = installing === r.package;
            // split "owner/repo@skill" for cleaner display
            const atIdx = r.package.indexOf("@");
            const repopart = atIdx > -1 ? r.package.slice(0, atIdx) : r.package;
            const skillpart = atIdx > -1 ? r.package.slice(atIdx + 1) : null;
            return (
              <div
                key={r.package}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "12px 0",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* skill name prominent */}
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--text)",
                      marginBottom: 3,
                    }}
                  >
                    {skillpart ?? repopart}
                  </div>
                  {/* repo + installs + link row */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                        color: "var(--text-dim)",
                      }}
                    >
                      {repopart}
                    </span>
                    <span
                      style={{
                        fontSize: 12,
                        color: "var(--text-muted)",
                        fontWeight: 500,
                      }}
                    >
                      {r.installs}
                    </span>
                    {r.url && (
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          fontSize: 12,
                          color: "var(--accent)",
                          textDecoration: "none",
                        }}
                      >
                        skills.sh ↗
                      </a>
                    )}
                  </div>
                </div>
                <button
                  onClick={() =>
                    !isInstalled && !isInstalling && install(r.package)
                  }
                  disabled={isInstalled || isInstalling || installing !== null}
                  style={{
                    flexShrink: 0,
                    padding: "5px 14px",
                    fontSize: 12,
                    fontWeight: 500,
                    borderRadius: 5,
                    border: "1px solid var(--border)",
                    cursor:
                      isInstalled || isInstalling || installing !== null
                        ? "not-allowed"
                        : "pointer",
                    background: isInstalled ? "rgba(34,197,94,0.1)" : "none",
                    color: isInstalled
                      ? "#16a34a"
                      : isInstalling
                        ? "var(--accent)"
                        : "var(--text-muted)",
                    transition: "color 0.12s",
                  }}
                >
                  {isInstalled
                    ? "✓ Installed"
                    : isInstalling
                      ? "Installing…"
                      : "Install"}
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        !searchError &&
        !searching && (
          <div
            style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.8 }}
          >
            Search{" "}
            <a
              href="https://skills.sh"
              target="_blank"
              rel="noreferrer"
              style={{ color: "var(--accent)", textDecoration: "none" }}
            >
              skills.sh
            </a>{" "}
            to discover and install skills for your agent.
          </div>
        )
      )}
    </div>
  );
}

export function SkillsConfig({
  cwd,
  onClose,
}: {
  cwd: string;
  onClose: () => void;
}) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [toggling, setToggling] = useState<Set<string>>(new Set());
  const [saveError, setSaveError] = useState<string | null>(null);
  const [addMode, setAddMode] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ success: boolean; message: string } | null>(null);

  const handleSync = async () => {
    setSyncing(true);
    setSyncStatus(null);
    try {
      const res = await fetch("/api/skills/sync", { 
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd }),
      });
      const data = await res.json() as { success?: boolean; message?: string; error?: string };
      if (!res.ok || data.error) {
        setSyncStatus({ success: false, message: data.error || "Sync failed" });
      } else {
        setSyncStatus({ success: true, message: data.message || "Successfully synced skills" });
        loadSkills();
      }
    } catch (e: any) {
      setSyncStatus({ success: false, message: e.message || String(e) });
    } finally {
      setSyncing(false);
    }
  };

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const loadSkills = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/skills?cwd=${encodeURIComponent(cwd)}`)
      .then((r) => r.json())
      .then((d: { skills?: Skill[]; error?: string }) => {
        if (d.error) {
          setError(d.error);
          return;
        }
        const list = d.skills ?? [];
        setSkills(list);
        if (!selected) setSelected("built-in:agent-skills");
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [cwd, selected]);

  const agentSkills = skills.filter((s) => s.sourceInfo?.source === "built-in");
  const baseRegularSkills = skills.filter((s) => s.sourceInfo?.source !== "built-in");
  const regularSkills = [
    ...baseRegularSkills,
    {
      name: "Agent Skills",
      description: "Production-grade engineering skills for AI coding agents. Includes spec, plan, build, verify, and review workflows.",
      filePath: "built-in:agent-skills",
      baseDir: "built-in",
      disableModelInvocation: false,
      sourceInfo: { source: "virtual", scope: "global" }
    } as Skill
  ];

  useEffect(() => {
    loadSkills();
  }, [cwd]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = useCallback(async (skill: Skill) => {
    const next = !skill.disableModelInvocation;
    setToggling((s) => new Set(s).add(skill.filePath));
    setSaveError(null);
    try {
      const res = await fetch("/api/skills", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filePath: skill.filePath,
          disableModelInvocation: next,
        }),
      });
      const d = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || d.error) {
        setSaveError(d.error ?? `HTTP ${res.status}`);
        return;
      }
      setSkills((prev) =>
        prev.map((s) =>
          s.filePath === skill.filePath
            ? { ...s, disableModelInvocation: next }
            : s,
        ),
      );
    } catch (e) {
      setSaveError(String(e));
    } finally {
      setToggling((s) => {
        const n = new Set(s);
        n.delete(skill.filePath);
        return n;
      });
    }
  }, []);

  const selectedSkill = skills.find((s) => s.filePath === selected) ?? null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: 860,
          height: "78vh",
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 18px",
            borderBottom: "1px solid var(--border)",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span
              style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}
            >
              Skills
            </span>
            <code
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                fontFamily: "var(--font-mono)",
                maxWidth: 320,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {shortenPath(cwd)}
            </code>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: 20,
              lineHeight: 1,
              padding: "2px 6px",
            }}
          >
            ×
          </button>
        </div>

        {/* Sync Status Banner */}
        {syncStatus && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 18px",
              fontSize: 12,
              background: syncStatus.success
                ? "rgba(34,197,94,0.12)"
                : "rgba(239,68,68,0.12)",
              color: syncStatus.success ? "#16a34a" : "#ef4444",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{syncStatus.message}</span>
            <button
              onClick={() => setSyncStatus(null)}
              style={{
                background: "none",
                border: "none",
                color: "inherit",
                cursor: "pointer",
                fontSize: 14,
                lineHeight: 1,
                padding: "0 4px",
              }}
            >
              ×
            </button>
          </div>
        )}

        {/* Body */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {/* Left: skill list */}
          <div
            style={{
              width: 210,
              borderRight: "1px solid var(--border)",
              display: "flex",
              flexDirection: "column",
              flexShrink: 0,
              background: "var(--bg-panel)",
            }}
          >
            <div style={{ flex: 1, overflowY: "auto", padding: "8px 6px" }}>
              {loading ? (
                <div
                  style={{
                    padding: "10px 8px",
                    fontSize: 12,
                    color: "var(--text-muted)",
                  }}
                >
                  Loading…
                </div>
              ) : error ? (
                <div
                  style={{
                    padding: "10px 8px",
                    fontSize: 11,
                    color: "#f87171",
                  }}
                >
                  {error}
                </div>
              ) : regularSkills.length === 0 ? (
                <div
                  style={{
                    padding: "10px 8px",
                    fontSize: 11,
                    color: "var(--text-dim)",
                  }}
                >
                  No skills found
                </div>
              ) : (
                (() => {
                  const groups: { label: string; skills: typeof skills }[] = [];
                  for (const grpLabel of ["project", "global", "virtual", "path"]) {
                    const grpSkills = regularSkills.filter(
                      (s) => sourceLabel(s) === grpLabel,
                    );
                    if (grpSkills.length > 0)
                      groups.push({ label: grpLabel, skills: grpSkills });
                  }
                  return groups.map(
                    ({ label: grpLabel, skills: grpSkills }) => (
                      <div key={grpLabel} style={{ marginBottom: 6 }}>
                        <div
                          style={{
                            padding: "4px 8px 3px",
                            fontSize: 10,
                            fontWeight: 600,
                            color: "var(--text-dim)",
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                          }}
                        >
                          {grpLabel}
                        </div>
                        {grpSkills.map((skill) => {
                          const isSelected =
                            !addMode && selected === skill.filePath;
                          const disabled = skill.disableModelInvocation;
                          return (
                            <div
                              key={skill.filePath}
                              onClick={() => {
                                setSelected(skill.filePath);
                                setAddMode(false);
                              }}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 7,
                                padding: "8px 8px",
                                borderRadius: 5,
                                cursor: "pointer",
                                background: isSelected
                                  ? "var(--bg-selected)"
                                  : "none",
                              }}
                              onMouseEnter={(e) => {
                                if (!isSelected)
                                  e.currentTarget.style.background =
                                    "var(--bg-hover)";
                              }}
                              onMouseLeave={(e) => {
                                if (!isSelected)
                                  e.currentTarget.style.background = "none";
                              }}
                            >
                              <span
                                style={{
                                  flexShrink: 0,
                                  width: 7,
                                  height: 7,
                                  borderRadius: "50%",
                                  background: disabled
                                    ? "var(--border)"
                                    : "var(--accent)",
                                  boxShadow: disabled
                                    ? "none"
                                    : "0 0 4px var(--accent)",
                                  transition:
                                    "background 0.15s, box-shadow 0.15s",
                                }}
                              />
                              <span
                                style={{
                                  fontSize: 12,
                                  fontWeight: isSelected ? 600 : 400,
                                  color: disabled
                                    ? "var(--text-dim)"
                                    : "var(--text)",
                                  fontFamily: "var(--font-mono)",
                                  flex: 1,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {skill.name}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ),
                  );
                })()
              )}
            </div>
            {/* Add skill button */}
            <div
              style={{
                padding: "8px 6px",
                borderTop: "1px solid var(--border)",
                flexShrink: 0,
              }}
            >
              <div
                onClick={() => setAddMode(true)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "7px 8px",
                  borderRadius: 5,
                  cursor: "pointer",
                  background: addMode ? "var(--bg-selected)" : "none",
                  color: addMode ? "var(--accent)" : "var(--text-dim)",
                  fontSize: 12,
                }}
                onMouseEnter={(e) => {
                  if (!addMode)
                    e.currentTarget.style.background = "var(--bg-hover)";
                }}
                onMouseLeave={(e) => {
                  if (!addMode) e.currentTarget.style.background = "none";
                }}
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Add skill
              </div>
            </div>
          </div>

          {/* Right: detail or add panel */}
          <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
            {addMode ? (
              <AddSkillPanel
                cwd={cwd}
                onInstalled={() => {
                  loadSkills();
                }}
              />
            ) : loading ? null : selected === "built-in:agent-skills" ? (
              <AgentSkillsDashboard
                agentSkills={agentSkills}
                syncing={syncing}
                syncStatus={syncStatus}
                setSyncStatus={setSyncStatus}
                handleSync={handleSync}
                toggle={toggle}
                toggling={toggling}
              />
            ) : selectedSkill ? (
              <SkillDetail
                key={selectedSkill.filePath}
                skill={selectedSkill}
                cwd={cwd}
                onToggle={toggle}
                toggling={toggling.has(selectedSkill.filePath)}
                saveError={saveError}
              />
            ) : (
              <div
                style={{
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--text-dim)",
                  fontSize: 13,
                }}
              >
                Select a skill
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            padding: "10px 18px",
            borderTop: "1px solid var(--border)",
            flexShrink: 0,
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: "6px 14px",
              background: "none",
              border: "1px solid var(--border)",
              borderRadius: 6,
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function AgentSkillsDashboard({
  agentSkills,
  syncing,
  syncStatus,
  setSyncStatus,
  handleSync,
  toggle,
  toggling,
}: {
  agentSkills: Skill[];
  syncing: boolean;
  syncStatus: { success: boolean; message: string } | null;
  setSyncStatus: (s: { success: boolean; message: string } | null) => void;
  handleSync: () => void;
  toggle: (skill: Skill) => void;
  toggling: Set<string>;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 20 }}>
      {/* Dashboard Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--border)", paddingBottom: 16 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>Agent Skills</div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
            Production-grade engineering skills for AI coding agents.
          </div>
        </div>

        <button
          onClick={handleSync}
          disabled={syncing}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 14px",
            fontSize: 13,
            fontWeight: 600,
            borderRadius: 6,
            border: "none",
            background: syncing ? "var(--bg-hover)" : "var(--accent)",
            color: syncing ? "var(--text)" : "#fff",
            cursor: syncing ? "wait" : "pointer",
            transition: "all 0.15s ease",
            boxShadow: syncing ? "none" : "0 1px 3px rgba(0,0,0,0.1)",
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              animation: syncing ? "spin 1.2s linear infinite" : "none",
            }}
          >
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
          </svg>
          {syncing ? "Syncing..." : "Update from GitHub"}
        </button>
      </div>

      {/* Sync Status Banner */}
      {syncStatus && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 16px",
            borderRadius: 6,
            fontSize: 13,
            background: syncStatus.success
              ? "rgba(34,197,94,0.12)"
              : "rgba(239,68,68,0.12)",
            color: syncStatus.success ? "#16a34a" : "#ef4444",
            border: syncStatus.success
              ? "1px solid rgba(34,197,94,0.2)"
              : "1px solid rgba(239,68,68,0.2)",
          }}
        >
          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{syncStatus.message}</span>
          <button
            onClick={() => setSyncStatus(null)}
            style={{
              background: "none",
              border: "none",
              color: "inherit",
              cursor: "pointer",
              fontSize: 16,
              lineHeight: 1,
              padding: "0 4px",
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Nested Skills List */}
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
        {agentSkills.length === 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: 200,
              color: "var(--text-dim)",
              gap: 12,
              border: "1px dashed var(--border)",
              borderRadius: 8,
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
              <line x1="12" y1="22.08" x2="12" y2="12" />
            </svg>
            <div style={{ fontSize: 13, textAlign: "center" }}>
              No agent skills installed.<br />Click &quot;Update from GitHub&quot; to download the official repository.
            </div>
          </div>
        ) : (
          agentSkills.map((skill) => {
            const enabled = !skill.disableModelInvocation;
            const isToggling = toggling.has(skill.filePath);
            return (
              <div
                key={skill.filePath}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 16,
                  padding: "14px 16px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--bg-panel)",
                  transition: "all 0.15s ease",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", fontFamily: "var(--font-mono)" }}>
                    {skill.name}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6, lineHeight: 1.5 }}>
                    {skill.description}
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, marginTop: 2 }}>
                  <span style={{ fontSize: 11, color: enabled ? "var(--accent)" : "var(--text-dim)" }}>
                    {enabled ? "Enabled" : "Disabled"}
                  </span>
                  <Toggle
                    enabled={enabled}
                    loading={isToggling}
                    onToggle={() => toggle(skill)}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
