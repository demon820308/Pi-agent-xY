'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { CriticStep } from '@/hooks/useDesignCritic';
import type { CriticConfig, CritiqueResult, CriticIssue } from '@/lib/design-critic/types';
import { SelectableOverlay } from './SelectableOverlay';
import { HtmlPreviewOverlay } from './HtmlPreviewOverlay';
import type { UserSelection } from './AnnotatedImage';
import { generateCodeForIssue } from '@/lib/design-critic/code-generator';
import { isVisionModel } from '@/lib/vision';

const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩',
  '⑪', '⑫', '⑬', '⑭', '⑮', '⑯', '⑰', '⑱', '⑲', '⑳'];

interface DesignSystemInfo {
  id: string;
  name: string;
  category: string;
}

interface DesignCriticPanelProps {
  state: {
    step: CriticStep;
    progress: number;
    statusText: string;
    result: CritiqueResult | null;
    error: string | null;
  };
  config: CriticConfig;
  onConfigChange: (config: CriticConfig) => void;
  onAnalyze: (input: { imageBase64?: string; url?: string; htmlSource?: string }) => void;
  onReset: () => void;
  onClose: () => void;
  onGenerateFixInSession?: (issues: CriticIssue[]) => void;
  onGenerateManualFix?: (params: {
    screenshot: string;
    selections: UserSelection[];
    prompts: Map<number, string>;
    codes: Map<number, string>;
    htmlSource?: string;
    filePath?: string;
  }) => void;
  onGenerateReplica?: (params: {
    screenshot?: string;
    url?: string;
    designSystemId?: string;
    prompt: string;
    code?: string;
    replicaMode?: 'hifi' | 'wireframe' | 'nextjs';
    targetPath?: string;
    cloneLanguage?: 'zh' | 'en';
  }) => void;
  onGenerateStyleTransfer?: (params: {
    sourceScreenshot?: string;
    sourceHtml?: string;
    sourceFilePath?: string;
    refScreenshot?: string;
    refUrl?: string;
    refDesignSystemId?: string;
    prompt: string;
    targetPath?: string;
  }) => void;
  onGenerateCritique?: (params: {
    screenshot?: string;
    url?: string;
  }) => void;
  onGeneratePPT?: (prompt: string) => void;
  modelList?: { id: string; name: string; provider: string; supportsVision?: boolean }[];
  currentModelKey?: string;
  onModelChange?: (provider: string, modelId: string) => void;
  workspaceCwd?: string | null;
}

type MainTab = 'manual' | 'replica' | 'style-transfer' | 'cloner' | 'critique' | 'ppt';

export function DesignCriticPanel({
  state,
  config,
  onConfigChange,
  onAnalyze,
  onReset,
  onClose,
  onGenerateFixInSession,
  onGenerateManualFix,
  onGenerateReplica,
  onGenerateStyleTransfer,
  onGenerateCritique,
  onGeneratePPT,
  modelList,
  currentModelKey,
  onModelChange,
  workspaceCwd,
}: DesignCriticPanelProps) {
  const [mainTab, setMainTab] = useState<MainTab>('manual');
  const [fullscreen, setFullscreen] = useState(false);
  const [hoveredSelId, setHoveredSelId] = useState<number | null>(null);

  // Manual tab state
  const [manualInputMode, setManualInputMode] = useState<'image' | 'code'>('code');
  const [selectModeActive, setSelectModeActive] = useState(false);
  const [manualScreenshot, setManualScreenshot] = useState<string | null>(null);
  const [manualSelections, setManualSelections] = useState<UserSelection[]>([]);
  const [manualPrompts, setManualPrompts] = useState<Map<number, string>>(new Map());
  const [manualCodes, setManualCodes] = useState<Map<number, string>>(new Map());
  const [manualHtmlSource, setManualHtmlSource] = useState<string>('');
  const [manualFilePath, setManualFilePath] = useState<string>('');
  const [manualUrl, setManualUrl] = useState('');
  const [isCapturingManual, setIsCapturingManual] = useState(false);

  // Replica tab state
  const [replicaScreenshot, setReplicaScreenshot] = useState<string | null>(null);
  const [replicaUrl, setReplicaUrl] = useState('');
  const [replicaPrompt, setReplicaPrompt] = useState('');
  const [replicaDesignSystem, setReplicaDesignSystem] = useState('');
  const [replicaCode, setReplicaCode] = useState('');
  const [replicaInputMode, setReplicaInputMode] = useState<'screenshot' | 'url' | 'design-system'>('design-system');
  const [isDsOverlayEnabled, setIsDsOverlayEnabled] = useState(false);
  const [replicaMode, setReplicaMode] = useState<'hifi' | 'wireframe'>('hifi');
  const [nextjsTargetPath, setNextjsTargetPath] = useState('');
  const [cloneLanguage, setCloneLanguage] = useState<'zh' | 'en'>('zh');
  const [isCapturingReplica, setIsCapturingReplica] = useState(false);

  // Critique tab state
  const [critiqueInputMode, setCritiqueInputMode] = useState<'image' | 'url'>('image');
  const [critiqueScreenshot, setCritiqueScreenshot] = useState<string | null>(null);
  const [critiqueUrl, setCritiqueUrl] = useState('');
  const [isCritiqueCapturing, setIsCritiqueCapturing] = useState(false);

  // Style Transfer tab state
  const [stSourceInputMode, setStSourceInputMode] = useState<'screenshot' | 'html'>('html');
  const [stSourceScreenshot, setStSourceScreenshot] = useState<string | null>(null);
  const [stSourceHtml, setStSourceHtml] = useState('');
  const [stSourceFilePath, setStSourceFilePath] = useState('');
  const [stRefInputMode, setStRefInputMode] = useState<'screenshot' | 'url' | 'design-system'>('design-system');
  const [stRefScreenshot, setStRefScreenshot] = useState<string | null>(null);
  const [stRefUrl, setStRefUrl] = useState('');
  const [stRefDesignSystem, setStRefDesignSystem] = useState('');
  const [stRefPrompt, setStRefPrompt] = useState('');
  const [stRefCode, setStRefCode] = useState('');
  const [stIsCapturingRef, setIsCapturingStRef] = useState(false);
  const [stIsDsOverlayEnabled, setStIsDsOverlayEnabled] = useState(false);
  const [stTargetPath, setStTargetPath] = useState('');

  // PPT tab state
  const [pptTopic, setPptTopic] = useState('');
  const [pptAudience, setPptAudience] = useState('');
  const [pptTheme, setPptTheme] = useState('tokyo-night');
  const [pptTemplate, setPptTemplate] = useState('tech-sharing');
  const [pptSlides, setPptSlides] = useState(8);

  // Design systems
  const [designSystems, setDesignSystems] = useState<DesignSystemInfo[]>([]);
  const [dsSearch, setDsSearch] = useState('');


  useEffect(() => {
    if ((mainTab === 'replica' || mainTab === 'style-transfer') && designSystems.length === 0) {
      fetch('/api/design-systems')
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data)) setDesignSystems(data);
          else if (data.systems) setDesignSystems(data.systems);
        })
        .catch(() => {});
    }
  }, [mainTab, designSystems.length]);

  const handleManualImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setManualScreenshot(reader.result as string);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }, []);

  const handleManualHtmlUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setManualHtmlSource(reader.result as string);
      setManualFilePath(file.name);
    };
    reader.readAsText(file);
    e.target.value = '';
  }, []);

  const handleManualCaptureUrl = useCallback(async () => {
    if (isCapturingManual) return;
    if (!manualUrl.trim()) {
      alert('请输入网页 URL');
      return;
    }
    setIsCapturingManual(true);
    try {
      const res = await fetch('/api/design-critic/screenshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: manualUrl }),
      });
      if (!res.ok) throw new Error('Screenshot failed');
      const data = await res.json();
      setManualScreenshot(data.imageBase64);
    } catch (err) {
      alert('截图失败，请重试');
    } finally {
      setIsCapturingManual(false);
    }
  }, [manualUrl, isCapturingManual]);

  const handleReplicaFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setReplicaScreenshot(reader.result as string);
      setReplicaInputMode('screenshot');
    };
    reader.readAsDataURL(file);
  }, []);

  const handleReplicaCaptureUrl = useCallback(async () => {
    if (isCapturingReplica) return;
    if (!replicaUrl.trim()) {
      alert('请输入网页 URL');
      return;
    }
    setIsCapturingReplica(true);
    try {
      const res = await fetch('/api/design-critic/screenshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: replicaUrl }),
      });
      if (!res.ok) throw new Error('Screenshot failed');
      const data = await res.json();
      setReplicaScreenshot(data.imageBase64);
      // Keep replicaInputMode as 'url' so the URL is sent to the agent alongside the captured screenshot
    } catch (err) {
      alert('截图失败，请重试');
    } finally {
      setIsCapturingReplica(false);
    }
  }, [replicaUrl, isCapturingReplica]);

  const handleStSourceScreenshotUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setStSourceScreenshot(reader.result as string);
      setStSourceInputMode('screenshot');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }, []);

  const handleStSourceHtmlUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setStSourceHtml(reader.result as string);
      setStSourceFilePath(file.name);
      setStSourceInputMode('html');
    };
    reader.readAsText(file);
    e.target.value = '';
  }, []);

  const handleStRefScreenshotUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setStRefScreenshot(reader.result as string);
      setStRefInputMode('screenshot');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }, []);

  const handleStCaptureUrl = useCallback(async () => {
    if (stIsCapturingRef) return;
    if (!stRefUrl.trim()) {
      alert('请输入参考网页 URL');
      return;
    }
    setIsCapturingStRef(true);
    try {
      const res = await fetch('/api/design-critic/screenshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: stRefUrl }),
      });
      if (!res.ok) throw new Error('Screenshot failed');
      const data = await res.json();
      setStRefScreenshot(data.imageBase64);
    } catch (err) {
      alert('截图失败，请重试');
    } finally {
      setIsCapturingStRef(false);
    }
  }, [stRefUrl, stIsCapturingRef]);

  const handleStGenerate = useCallback(() => {
    if (!onGenerateStyleTransfer) return;
    if (stSourceInputMode === 'screenshot' && !stSourceScreenshot && !stSourceHtml) {
      alert('请上传源页面截图或粘贴源 HTML');
      return;
    }
    if (stSourceInputMode === 'html' && !stSourceHtml && !stSourceScreenshot) {
      alert('请上传源页面截图或粘贴源 HTML');
      return;
    }
    if (!stRefPrompt.trim()) {
      alert('请输入风格复刻需求描述');
      return;
    }
    onGenerateStyleTransfer({
      sourceScreenshot: stSourceInputMode === 'screenshot' ? (stSourceScreenshot || undefined) : undefined,
      sourceHtml: stSourceInputMode === 'html' ? (stSourceHtml || undefined) : undefined,
      sourceFilePath: stSourceInputMode === 'html' ? stSourceFilePath : undefined,
      refScreenshot: stRefInputMode === 'screenshot' ? (stRefScreenshot || undefined) : (stRefInputMode === 'url' ? (stRefScreenshot || undefined) : undefined),
      refUrl: stRefInputMode === 'url' ? stRefUrl : undefined,
      refDesignSystemId: stRefInputMode === 'design-system' ? (stRefDesignSystem || undefined) : (stIsDsOverlayEnabled ? (stRefDesignSystem || undefined) : undefined),
      prompt: stRefPrompt,
      targetPath: stTargetPath || undefined,
    });
  }, [stSourceInputMode, stSourceScreenshot, stSourceHtml, stSourceFilePath, stRefInputMode, stRefScreenshot, stRefUrl, stRefDesignSystem, stRefPrompt, stIsDsOverlayEnabled, stTargetPath, onGenerateStyleTransfer]);

  const handleManualGenerate = useCallback(() => {
    if (!onGenerateManualFix) return;
    if (manualSelections.length === 0) {
      alert('请先在截图上框选需要修改的区域');
      return;
    }
    onGenerateManualFix({
      screenshot: manualScreenshot || '',
      selections: manualSelections,
      prompts: manualPrompts,
      codes: manualCodes,
      htmlSource: manualHtmlSource || undefined,
      filePath: manualHtmlSource ? manualFilePath : undefined,
    });
  }, [manualScreenshot, manualSelections, manualPrompts, manualCodes, manualHtmlSource, manualFilePath, onGenerateManualFix]);

  const handleReplicaGenerate = useCallback(() => {
    if (!onGenerateReplica) return;

    if (mainTab === 'cloner') {
      if (!replicaUrl.trim()) {
        alert('请输入目标网站 URL');
        return;
      }
      onGenerateReplica({
        url: replicaUrl,
        prompt: '',
        replicaMode: 'nextjs',
        targetPath: nextjsTargetPath || undefined,
        cloneLanguage: cloneLanguage,
      });
      return;
    }

    if (replicaInputMode === 'design-system' && !replicaDesignSystem) {
      alert('请先在左侧选择一个设计规范模板');
      return;
    }

    if (!replicaPrompt.trim()) {
      alert('请输入复刻需求描述');
      return;
    }
    onGenerateReplica({
      screenshot: replicaInputMode === 'design-system' ? undefined : (replicaScreenshot || undefined),
      url: replicaInputMode === 'url' ? replicaUrl : undefined,
      designSystemId: replicaMode === 'hifi' ? (replicaDesignSystem || undefined) : undefined,
      prompt: replicaMode === 'wireframe'
        ? `[WIREFRAME SKETCH MODE]\n请生成手绘线框图风格的 HTML，不要使用高保真设计。要求：石墨纸背景（linear-gradient 网格线）、马克笔字体（Google Fonts: Caveat 或 Patrick Hand）、虚线边框、轻微旋转元素营造手绘感、孵化填充图表占位、便利贴注释。\n\n用户补充需求：${replicaPrompt}`
        : replicaPrompt,
      code: replicaCode || undefined,
      replicaMode,
    });
  }, [replicaScreenshot, replicaUrl, replicaInputMode, replicaDesignSystem, replicaPrompt, replicaCode, replicaMode, nextjsTargetPath, cloneLanguage, mainTab, onGenerateReplica]);

  const filteredDesignSystems = dsSearch.trim()
    ? designSystems.filter(
        (d) =>
          d.name.toLowerCase().includes(dsSearch.toLowerCase()) ||
          d.category.toLowerCase().includes(dsSearch.toLowerCase()),
      )
    : designSystems;

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 10px',
    fontSize: 13,
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    color: 'var(--text)',
    outline: 'none',
  };

  const btnStyle = (primary = false): React.CSSProperties => ({
    padding: '8px 16px',
    fontSize: 13,
    fontWeight: 600,
    background: primary ? 'var(--accent)' : 'var(--bg-hover)',
    color: primary ? '#fff' : 'var(--text)',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    transition: 'opacity 0.15s',
  });

  const hasManualContent = !!(manualScreenshot || manualHtmlSource);
  const hasReplicaContent = !!(replicaScreenshot || replicaUrl);
  const hasContent = mainTab === 'manual' ? hasManualContent : (mainTab === 'replica' ? hasReplicaContent : false);

  // Dynamic vision capability check
  const currentSelectedModel = modelList?.find(m => `${m.provider}/${m.id}` === currentModelKey);
  const currentSupportsVision = currentSelectedModel?.supportsVision || (currentSelectedModel ? isVisionModel(currentSelectedModel.provider, currentSelectedModel.id) : false);

  const needsVision = (() => {
    if (mainTab === 'manual') {
      return !!manualScreenshot;
    }
    if (mainTab === 'replica') {
      return replicaInputMode !== 'design-system';
    }
    if (mainTab === 'style-transfer') {
      return stSourceInputMode === 'screenshot' || stRefInputMode === 'screenshot' || stRefInputMode === 'url';
    }
    if (mainTab === 'critique') {
      return true; // Critique always requires vision to analyze screenshots
    }
    return false;
  })();

  const showVisionWarning = needsVision && currentSelectedModel && !currentSupportsVision;

  useEffect(() => {
    setSelectModeActive(false);
  }, [mainTab, manualInputMode, hasManualContent]);

  const tabs: { key: MainTab; label: string }[] = [
    { key: 'manual', label: '手动微调' },
    { key: 'replica', label: '整体复刻' },
    { key: 'style-transfer', label: '风格复刻' },
    { key: 'cloner', label: '网站复刻' },
    { key: 'critique', label: '设计评审' },
    { key: 'ppt', label: 'PPT 制作' },
  ];

  return (
    <div style={{
      width: fullscreen ? '100vw' : '100%',
      maxWidth: fullscreen ? 'none' : (hasContent ? 1200 : 900),
      height: fullscreen ? '100vh' : '80vh',
      maxHeight: fullscreen ? 'none' : '80vh',
      background: 'var(--bg-panel)',
      borderRadius: fullscreen ? 0 : 12,
      border: fullscreen ? 'none' : '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      transition: 'max-width 0.2s ease',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 16px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', letterSpacing: '0.02em' }}>
            Design Tools
          </span>
          {/* Tabs - Integrated into Header next to Title */}
          <div style={{
            display: 'flex',
            background: 'var(--bg-hover)',
            padding: 3,
            borderRadius: 8,
            gap: 2,
            border: '1px solid var(--border)',
          }}>
            {tabs.map((tab) => {
              const isActive = mainTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setMainTab(tab.key)}
                  style={{
                    padding: '4px 12px',
                    fontSize: 12,
                    fontWeight: isActive ? 600 : 400,
                    background: isActive ? 'var(--bg-selected)' : 'transparent',
                    border: 'none',
                    borderRadius: 6,
                    color: isActive ? 'var(--text)' : 'var(--text-muted)',
                    cursor: 'pointer',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  {tab.key === 'manual' ? '📸 手动微调' : tab.key === 'replica' ? '🚀 整体复刻' : tab.key === 'style-transfer' ? '🎭 风格复刻' : tab.key === 'cloner' ? '🧲 网站复刻' : tab.key === 'critique' ? '🔍 设计评审' : '📑 PPT 制作'}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            onClick={() => setFullscreen((v) => !v)}
            title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            style={{
              background: 'none', border: 'none', color: 'var(--text-muted)',
              cursor: 'pointer', fontSize: 14, padding: '4px 6px',
              display: 'flex', alignItems: 'center',
            }}
          >
            {fullscreen ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/>
                <path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/>
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/>
                <path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>
              </svg>
            )}
          </button>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', color: 'var(--text-muted)',
              cursor: 'pointer', fontSize: 18, padding: '0 4px',
            }}
          >
            x
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* Manual Tab */}
        {mainTab === 'manual' && !hasManualContent && (
          /* Upload Screen */
          <div style={{ flex: 1, overflow: 'auto', padding: '32px 24px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <div style={{
              maxWidth: 960,
              width: '100%',
              display: 'grid',
              gridTemplateColumns: '1.2fr 1fr',
              gap: 32,
              alignItems: 'stretch',
            }}>
              {/* Left Column: Upload & Input Zone */}
              <div style={{
                border: '1px solid var(--border)',
                borderRadius: 16,
                background: 'var(--bg)',
                padding: 24,
                boxShadow: '0 8px 30px rgba(0,0,0,0.04)',
                display: 'flex',
                flexDirection: 'column',
                gap: 20,
              }}>
                {/* Sub-tab switcher inside Card */}
                <div style={{
                  display: 'flex',
                  background: 'var(--bg-hover)',
                  padding: 4,
                  borderRadius: 10,
                  gap: 4,
                  border: '1px solid var(--border)',
                }}>
                  <button
                    type="button"
                    onClick={() => setManualInputMode('code')}
                    style={{
                      flex: 1,
                      padding: '8px 16px',
                      fontSize: 12,
                      fontWeight: 600,
                      borderRadius: 8,
                      border: 'none',
                      cursor: 'pointer',
                      background: manualInputMode === 'code' ? 'var(--bg-selected)' : 'transparent',
                      color: manualInputMode === 'code' ? 'var(--text)' : 'var(--text-muted)',
                      transition: 'all 0.2s ease',
                      boxShadow: manualInputMode === 'code' ? '0 2px 6px rgba(0,0,0,0.04)' : 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="16 18 22 12 16 6" />
                      <polyline points="8 6 2 12 8 18" />
                    </svg>
                    代码微调
                  </button>
                  <button
                    type="button"
                    onClick={() => setManualInputMode('image')}
                    style={{
                      flex: 1,
                      padding: '8px 16px',
                      fontSize: 12,
                      fontWeight: 600,
                      borderRadius: 8,
                      border: 'none',
                      cursor: 'pointer',
                      background: manualInputMode === 'image' ? 'var(--bg-selected)' : 'transparent',
                      color: manualInputMode === 'image' ? 'var(--text)' : 'var(--text-muted)',
                      transition: 'all 0.2s ease',
                      boxShadow: manualInputMode === 'image' ? '0 2px 6px rgba(0,0,0,0.04)' : 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                    图片微调
                  </button>
                </div>

                {manualInputMode === 'image' ? (
                  /* Image Mode controls */
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1, justifyContent: 'center' }}>
                    {/* Drag-and-drop styled uploader */}
                    <label style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '2px dashed var(--border)',
                      borderRadius: 12,
                      padding: '40px 20px',
                      cursor: 'pointer',
                      background: 'var(--bg-panel)',
                      transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                      textAlign: 'center',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--accent)';
                      e.currentTarget.style.background = 'var(--bg-subtle)';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border)';
                      e.currentTarget.style.background = 'var(--bg-panel)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                    >
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent)', marginBottom: 12 }}>
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                        点击或将网页截图拖拽到此处上传
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                        支持 JPG, PNG, GIF, WebP 等常见图片格式
                      </span>
                      <input type="file" accept="image/*" onChange={handleManualImageUpload} style={{ display: 'none' }} />
                    </label>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                      <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase' }}>或者</span>
                      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                    </div>

                    {/* URL Capture section */}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <div style={{
                        position: 'relative',
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                      }}>
                        <div style={{ position: 'absolute', left: 10, display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-dim)' }}>
                            <circle cx="12" cy="12" r="10" />
                            <line x1="2" y1="12" x2="22" y2="12" />
                            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                          </svg>
                        </div>
                        <input
                          type="text"
                          placeholder="输入网页 URL 自动捕获截图..."
                          value={manualUrl}
                          onChange={(e) => setManualUrl(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleManualCaptureUrl(); }}
                          style={{
                            ...inputStyle,
                            height: 38,
                            paddingLeft: 32,
                            border: '1px solid var(--border)',
                            borderRadius: 8,
                            fontSize: 12,
                            width: '100%',
                          }}
                        />
                      </div>
                      <button
                        onClick={handleManualCaptureUrl}
                        disabled={isCapturingManual}
                        style={{
                          ...btnStyle(true),
                          height: 38,
                          borderRadius: 8,
                          padding: '0 16px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          opacity: isCapturingManual ? 0.7 : 1,
                          cursor: isCapturingManual ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {isCapturingManual ? (
                          <>
                            <span>⏳ 截图中...</span>
                          </>
                        ) : (
                          <>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                            </svg>
                            <span>截图</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Code Mode controls */
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1, justifyContent: 'center' }}>
                    {/* Drag-and-drop HTML uploader */}
                    <label style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '2px dashed var(--border)',
                      borderRadius: 12,
                      padding: '30px 20px',
                      cursor: 'pointer',
                      background: 'var(--bg-panel)',
                      transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                      textAlign: 'center',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--accent)';
                      e.currentTarget.style.background = 'var(--bg-subtle)';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border)';
                      e.currentTarget.style.background = 'var(--bg-panel)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                    >
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent)', marginBottom: 12 }}>
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                        <polyline points="10 9 9 9 8 9" />
                      </svg>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                        点击或将 HTML 代码文件拖拽到此处上传
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                        支持 .html 或 .htm 文件
                      </span>
                      <input type="file" accept=".html,.htm" onChange={handleManualHtmlUpload} style={{ display: 'none' }} />
                    </label>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                      <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>或者</span>
                      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                    </div>

                    {/* Direct paste code block */}
                    <textarea
                      placeholder="在此处直接粘贴 HTML 代码..."
                      value={manualHtmlSource}
                      onChange={(e) => {
                        setManualHtmlSource(e.target.value);
                        if (manualFilePath) setManualFilePath('');
                      }}
                      style={{
                        ...inputStyle,
                        minHeight: 100,
                        maxHeight: 140,
                        resize: 'vertical',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11,
                        lineHeight: 1.5,
                        borderRadius: 8,
                        padding: 10,
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Right Column: Quick Start Guide & Use Cases */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                border: '1px solid var(--border)',
                borderRadius: 16,
                background: 'var(--bg)',
                padding: 24,
                boxShadow: '0 8px 30px rgba(0,0,0,0.04)',
                gap: 20,
              }}>
                {/* Guide Section */}
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent)' }}>
                      <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A5 5 0 0 0 8 8c0 1 .5 2.5 1.5 3.5.7.8 1.3 1.5 1.5 2.5" />
                      <line x1="9" y1="18" x2="15" y2="18" />
                      <line x1="10" y1="22" x2="14" y2="22" />
                    </svg>
                    <span>极速上手指南</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'relative' }}>
                    {/* Vertical timeline line */}
                    <div style={{
                      position: 'absolute',
                      left: 11,
                      top: 12,
                      bottom: 12,
                      width: 2,
                      background: 'var(--border)',
                      opacity: 0.5,
                    }} />

                    {[
                      { num: '1', title: '载入网页界面', desc: '选择图片微调或代码微调，上传本地截图、拖入 HTML 或输入 URL。' },
                      { num: '2', title: '划定需要修改的区域', desc: '点击顶部工具栏的“🎯 开启框选”按钮，在预览画面上拖拽鼠标圈定区域。' },
                      { num: '3', title: '描述需求 & 自动修复', desc: '在选区文本框中输入您的修改指令，点击“生成修改方案”即可自动修复。' }
                    ].map((step, sIdx) => (
                      <div key={sIdx} style={{ display: 'flex', gap: 14, alignItems: 'flex-start', position: 'relative', zIndex: 1 }}>
                        <div style={{
                          width: 24,
                          height: 24,
                          borderRadius: '50%',
                          background: 'var(--bg)',
                          border: '2px solid var(--accent)',
                          color: 'var(--accent)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 11,
                          fontWeight: 700,
                          boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
                          flexShrink: 0,
                        }}>
                          {step.num}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{step.title}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>{step.desc}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Divider */}
                <div style={{ height: 1, background: 'var(--border)' }} />

                {/* Common Scenarios Section */}
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent)' }}>
                      <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2" />
                      <line x1="12" y1="22" x2="12" y2="15.5" />
                      <polyline points="22 8.5 12 15.5 2 8.5" />
                      <polyline points="2 15.5 12 8.5 22 15.5" />
                      <line x1="12" y1="2" x2="12" y2="8.5" />
                    </svg>
                    <span>常见微调场景</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {[
                      {
                        icon: '🎨',
                        title: '样式与视觉升级',
                        desc: '微调组件大小、圆角、字重、颜色或阴影，使其符合最新的设计趋势。',
                      },
                      {
                        icon: '📐',
                        title: '排版与间距修正',
                        desc: '调整元素之间的间距 (Margin/Padding)、对齐方式以及适配问题。',
                      },
                      {
                        icon: '📝',
                        title: '文案与内容重塑',
                        desc: '快速重塑页面文案内容，更新组件文字占位或描述性文本。',
                      }
                    ].map((item, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          gap: 12,
                          padding: '10px 12px',
                          border: '1px solid var(--border)',
                          borderRadius: 10,
                          background: 'var(--bg-panel)',
                          alignItems: 'center',
                          transition: 'all 0.2s ease',
                        }}
                      >
                        <div style={{
                          fontSize: 16,
                          width: 30,
                          height: 30,
                          borderRadius: 8,
                          background: 'var(--bg)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                          flexShrink: 0,
                        }}>
                          {item.icon}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{item.title}</span>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.3 }}>{item.desc}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            </div>
          </div>
        )}

        {mainTab === 'manual' && hasManualContent && (
          /* Two-Column Edit Screen */
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            {/* Left: Preview + Selection */}
            <div style={{ flex: 5, minWidth: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)' }}>
              {/* Toolbar */}
              <div style={{
                height: 38,
                boxSizing: 'border-box',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 12px',
                borderBottom: '1px solid var(--border)',
                flexShrink: 0,
                background: 'var(--bg)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {manualHtmlSource ? (manualFilePath || '已粘贴 HTML') : '截图'}
                    {manualSelections.length > 0 && ` · 已选 ${manualSelections.length} 个区域`}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const nextVal = !selectModeActive;
                      setSelectModeActive(nextVal);
                    }}
                    style={{
                      padding: '4px 10px',
                      fontSize: 11,
                      fontWeight: 600,
                      borderRadius: 4,
                      cursor: 'pointer',
                      border: selectModeActive ? 'none' : '1px solid var(--accent)',
                      background: selectModeActive ? 'var(--accent)' : 'transparent',
                      color: selectModeActive ? '#fff' : 'var(--accent)',
                      transition: 'all 0.15s ease',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    {selectModeActive ? '🛑 退出框选' : '🎯 开启框选'}
                  </button>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>
                    {selectModeActive ? (
                      <span style={{ color: 'var(--accent)', fontWeight: 600 }}>🎯 框选模式已启用：请在页面上拖拽框选需要修改的区域</span>
                    ) : (
                      <span>正常浏览模式：可正常浏览、滚动页面。点击左侧“开启框选”开始标注。</span>
                    )}
                  </span>
                </div>
                <button
                  onClick={() => {
                    setManualScreenshot(null);
                    setManualHtmlSource('');
                    setManualFilePath('');
                    setManualSelections([]);
                    setManualPrompts(new Map());
                    setManualCodes(new Map());
                  }}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    color: 'var(--text-muted)',
                    padding: '4px 10px',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(239,68,68,0.5)';
                    e.currentTarget.style.color = 'rgb(239,68,68)';
                    e.currentTarget.style.background = 'rgba(239,68,68,0.04)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border)';
                    e.currentTarget.style.color = 'var(--text-muted)';
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  🔄 重新上传
                </button>
              </div>
              {/* Preview area */}
              <div style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                minHeight: 0,
                padding: 12,
                overflow: 'hidden'
              }}>
                {manualHtmlSource ? (
                  <HtmlPreviewOverlay
                    htmlSource={manualHtmlSource}
                    onSelectionsChange={setManualSelections}
                    highlightedId={hoveredSelId}
                    onHoverSelection={setHoveredSelId}
                    selectModeActive={selectModeActive}
                  />
                ) : manualScreenshot ? (
                  <div style={{ flex: 1, overflow: 'auto' }}>
                    <SelectableOverlay
                      imageUrl={manualScreenshot}
                      onSelectionsChange={setManualSelections}
                      highlightedId={hoveredSelId}
                      onHoverSelection={setHoveredSelId}
                      selectModeActive={selectModeActive}
                    />
                  </div>
                ) : null}
              </div>
            </div>

            {/* Right: Prompts + Code */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              {/* Right header */}
              <div style={{
                height: 38,
                boxSizing: 'border-box',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 12px',
                borderBottom: '1px solid var(--border)',
                flexShrink: 0,
                background: 'var(--bg)',
              }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
                  修改需求
                </span>
              </div>
              {/* Right content */}
              <div style={{ flex: 1, overflow: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Model Selector */}
                {modelList && modelList.length > 0 && onModelChange && (
                  <div style={{
                    padding: '8px 10px',
                    borderBottom: '1px solid var(--border)',
                    marginBottom: 4,
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>改写大模型:</div>
                    <select
                      value={currentModelKey || ''}
                      onChange={(e) => {
                        const [provider, ...idParts] = e.target.value.split('/')
                        onModelChange(provider, idParts.join('/'))
                      }}
                      style={{ ...inputStyle, padding: '4px 8px', fontSize: 11 }}
                    >
                      {modelList.filter(m => !m.id.toLowerCase().includes("tts")).map((m) => {
                        const supportsV = m.supportsVision || isVisionModel(m.provider, m.id);
                        return (
                          <option key={`${m.provider}/${m.id}`} value={`${m.provider}/${m.id}`}>
                            {m.name} {supportsV ? ' (👁️ 视觉)' : ' (📝 文本)'}
                          </option>
                        );
                      })}
                    </select>
                    {showVisionWarning && (
                      <div style={{ color: '#f59e0b', fontSize: 10, marginTop: 4 }}>
                        ⚠️ 当前模式需要识别图片，请切换至带 👁️ 标识的视觉模型
                      </div>
                    )}
                  </div>
                )}

                {manualSelections.length === 0 ? (
                  <div style={{
                    height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--text-dim)', fontSize: 13, textAlign: 'center', padding: 24,
                  }}>
                    请在左侧画面中拖拽框选<br />需要修改的区域
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {manualSelections.map((sel, idx) => {
                      const label = CIRCLED[idx] || `${idx + 1}`;
                      const isHovered = hoveredSelId === sel.id;
                      return (
                        <div
                          key={sel.id}
                          onMouseEnter={() => setHoveredSelId(sel.id)}
                          onMouseLeave={() => setHoveredSelId(null)}
                          style={{
                            padding: '10px 12px',
                            border: `1px solid ${isHovered ? 'var(--accent)' : 'var(--border)'}`,
                            borderRadius: 8,
                            background: isHovered ? 'rgba(37,99,235,0.03)' : 'var(--bg)',
                            boxShadow: isHovered ? '0 2px 8px rgba(37,99,235,0.08)' : 'none',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
                          }}>
                            <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent)', lineHeight: 1 }}>
                              {label}
                            </span>
                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>修改需求</span>
                          </div>
                          <textarea
                            placeholder="描述这个区域需要怎样修改..."
                            value={manualPrompts.get(sel.id) || ''}
                            onChange={(e) => {
                              const next = new Map(manualPrompts);
                              next.set(sel.id, e.target.value);
                              setManualPrompts(next);
                            }}
                            style={{ ...inputStyle, minHeight: 52, resize: 'vertical', marginBottom: 8 }}
                          />
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                            参考代码（可选）
                          </div>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                            <textarea
                              placeholder="粘贴组件代码片段..."
                              value={manualCodes.get(sel.id) || ''}
                              onChange={(e) => {
                                const next = new Map(manualCodes);
                                next.set(sel.id, e.target.value);
                                setManualCodes(next);
                              }}
                              style={{
                                ...inputStyle,
                                minHeight: 40,
                                resize: 'vertical',
                                flex: 1,
                                fontFamily: 'var(--font-mono)',
                                fontSize: 11,
                              }}
                            />
                            <label style={{
                              ...btnStyle(), whiteSpace: 'nowrap', fontSize: 11, padding: '6px 10px', cursor: 'pointer',
                            }}>
                              上传
                              <input
                                type="file"
                                accept=".js,.jsx,.ts,.tsx,.vue,.css,.scss,.html,.json"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  const reader = new FileReader();
                                  reader.onload = () => {
                                    const next = new Map(manualCodes);
                                    next.set(sel.id, reader.result as string);
                                    setManualCodes(next);
                                  };
                                  reader.readAsText(file);
                                  e.target.value = '';
                                }}
                                style={{ display: 'none' }}
                              />
                            </label>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              {/* Generate button */}
              <div style={{ padding: 12, borderTop: '1px solid var(--border)', flexShrink: 0 }}>
                <button
                  onClick={handleManualGenerate}
                  disabled={manualSelections.length === 0}
                  style={{
                    ...btnStyle(true),
                    width: '100%',
                    opacity: manualSelections.length === 0 ? 0.5 : 1,
                  }}
                >
                  生成修改方案
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Replica Tab */}
        {mainTab === 'replica' && (
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            {/* Left: Reference Image / URL Preview */}
            <div style={{ flex: 7, minWidth: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', background: 'var(--bg)' }}>
              {/* Reference toolbar */}
              <div style={{
                height: 38,
                boxSizing: 'border-box',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 12px',
                borderBottom: '1px solid var(--border)',
                flexShrink: 0,
                background: 'var(--bg)',
              }}>
                {/* Mode switcher */}
                <div style={{ display: 'flex', background: 'var(--bg-hover)', padding: 2, borderRadius: 8, gap: 2, border: '1px solid var(--border)' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setReplicaInputMode('design-system');
                      setReplicaMode('hifi');
                    }}
                    style={{
                      padding: '4px 10px', fontSize: 11, fontWeight: replicaInputMode === 'design-system' ? 600 : 400,
                      background: replicaInputMode === 'design-system' ? 'var(--bg-selected)' : 'transparent',
                      border: 'none', borderRadius: 6, color: replicaInputMode === 'design-system' ? 'var(--text)' : 'var(--text-muted)', cursor: 'pointer',
                    }}
                  >🎨 规范模板</button>
                  <button
                    type="button"
                    onClick={() => {
                      setReplicaInputMode('url');
                    }}
                    style={{
                      padding: '4px 10px', fontSize: 11, fontWeight: replicaInputMode === 'url' ? 600 : 400,
                      background: replicaInputMode === 'url' ? 'var(--bg-selected)' : 'transparent',
                      border: 'none', borderRadius: 6, color: replicaInputMode === 'url' ? 'var(--text)' : 'var(--text-muted)', cursor: 'pointer',
                    }}
                  >🔗 网站链接</button>
                  <button
                    type="button"
                    onClick={() => {
                      setReplicaInputMode('screenshot');
                    }}
                    style={{
                      padding: '4px 10px', fontSize: 11, fontWeight: replicaInputMode === 'screenshot' ? 600 : 400,
                      background: replicaInputMode === 'screenshot' ? 'var(--bg-selected)' : 'transparent',
                      border: 'none', borderRadius: 6, color: replicaInputMode === 'screenshot' ? 'var(--text)' : 'var(--text-muted)', cursor: 'pointer',
                    }}
                  >📷 截图上传</button>
                </div>

                {(replicaScreenshot || replicaUrl.trim() || replicaDesignSystem) && (
                  <button
                    onClick={() => {
                      setReplicaScreenshot(null);
                      setReplicaUrl('');
                      setReplicaDesignSystem('');
                      setDsSearch('');
                    }}
                    style={{
                      background: 'transparent',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      color: 'var(--text-muted)',
                      padding: '4px 10px',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(239,68,68,0.5)';
                      e.currentTarget.style.color = 'rgb(239,68,68)';
                      e.currentTarget.style.background = 'rgba(239,68,68,0.04)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border)';
                      e.currentTarget.style.color = 'var(--text-muted)';
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    🔄 重置清空
                  </button>
                )}
              </div>
              
              {/* Reference preview area */}
              <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {replicaInputMode === 'screenshot' ? (
                  replicaScreenshot ? (
                    <img
                      src={replicaScreenshot}
                      alt="Preview"
                      style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8, border: '1px solid var(--border)' }}
                    />
                  ) : (
                    <div style={{
                      width: '100%', height: '100%', minHeight: 300, display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center', border: '2px dashed var(--border)',
                      borderRadius: 12, padding: 32, textAlign: 'center', background: 'var(--bg-panel)'
                    }}>
                      <div style={{ fontSize: 40, marginBottom: 12 }}>📸</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>上传参考截图</div>
                      <div style={{ fontSize: 12, color: 'var(--text-dim)', maxWidth: 320, lineHeight: 1.5, marginBottom: 16 }}>
                        选择本地的设计稿或网页截图，作为复刻的设计参考。
                      </div>
                      <label style={{ cursor: 'pointer', ...btnStyle(true), textAlign: 'center', width: '100%', maxWidth: 200 }}>
                        选择本地截图
                        <input type="file" accept="image/*" onChange={handleReplicaFileUpload} style={{ display: 'none' }} />
                      </label>
                    </div>
                  )
                ) : replicaInputMode === 'url' ? (
                  /* URL Mode */
                  replicaScreenshot ? (
                    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', gap: 12 }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', 
                        background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text-muted)'
                      }}>
                        <span style={{ flexShrink: 0 }}>🌐 关联网址:</span>
                        <a href={replicaUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'underline', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {replicaUrl}
                        </a>
                      </div>
                      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <img
                          src={replicaScreenshot}
                          alt="Preview"
                          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8, border: '1px solid var(--border)' }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div style={{
                      width: '100%', height: '100%', minHeight: 300, display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center', border: '2px dashed var(--border)',
                      borderRadius: 12, padding: 32, textAlign: 'center', background: 'var(--bg-panel)'
                    }}>
                      <div style={{ fontSize: 40, marginBottom: 12 }}>🔗</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>基于网站 URL 复刻</div>
                      <div style={{ fontSize: 12, color: 'var(--text-dim)', maxWidth: 320, lineHeight: 1.5, marginBottom: 16 }}>
                        输入网页 URL，AI 将使用网页读取工具获取该网址的结构和样式，并对其进行复刻。您也可以选择点击「截图」以同时捕获视觉参考。
                      </div>
                      <div style={{ display: 'flex', gap: 6, width: '100%', maxWidth: 400 }}>
                        <input
                          type="text"
                          placeholder="请输入网页 URL (如 https://example.com)..."
                          value={replicaUrl}
                          onChange={(e) => setReplicaUrl(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleReplicaCaptureUrl(); }}
                          style={{ ...inputStyle, flex: 1 }}
                        />
                        <button
                          onClick={handleReplicaCaptureUrl}
                          disabled={isCapturingReplica}
                          style={{
                            ...btnStyle(),
                            opacity: isCapturingReplica ? 0.7 : 1,
                            cursor: isCapturingReplica ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          {isCapturingReplica ? '⏳ 截图中...' : '截图 (可选)'}
                        </button>
                      </div>
                    </div>
                  )
                ) : (
                  /* Design System Template Mode */
                  replicaDesignSystem ? (
                    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <iframe
                        src={`/api/design-systems/${encodeURIComponent(replicaDesignSystem)}/preview`}
                        style={{
                          border: "none",
                          width: "100%",
                          height: "100%",
                          background: "var(--bg)",
                          borderRadius: 8,
                          boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                        }}
                        title={`Design System Preview ${replicaDesignSystem}`}
                        sandbox="allow-same-origin"
                      />
                    </div>
                  ) : (
                    <div style={{
                      width: '100%', height: '100%', minHeight: 300, display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'flex-start', border: '2px dashed var(--border)',
                      borderRadius: 12, padding: 24, textAlign: 'center', background: 'var(--bg-panel)',
                      overflowY: 'auto'
                    }}>
                      <div style={{ fontSize: 40, marginBottom: 12 }}>🎨</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>选择设计规范模板</div>
                      <div style={{ fontSize: 12, color: 'var(--text-dim)', maxWidth: 320, lineHeight: 1.5, marginBottom: 16 }}>
                        选择一个设计规范作为风格参考，AI 将严格遵循该规范的配色、字体和组件风格进行复刻。
                      </div>

                      {/* Search bar */}
                      <input
                        type="text"
                        placeholder="🔍 搜索设计系统或分类..."
                        value={dsSearch}
                        onChange={(e) => setDsSearch(e.target.value)}
                        style={{
                          width: '100%',
                          maxWidth: 480,
                          padding: '8px 12px',
                          fontSize: 12,
                          marginBottom: 20,
                          background: 'var(--bg)',
                          border: '1px solid var(--border)',
                          borderRadius: 8,
                          color: 'var(--text)',
                          outline: 'none',
                        }}
                      />

                      {/* Grouped Design Systems */}
                      {(() => {
                        const filteredDS = designSystems.filter(ds =>
                          ds.name.toLowerCase().includes(dsSearch.toLowerCase()) ||
                          ds.category.toLowerCase().includes(dsSearch.toLowerCase())
                        );
                        const categories = Array.from(new Set(filteredDS.map(ds => ds.category))).sort();

                        if (filteredDS.length === 0) {
                          return (
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '20px 0' }}>
                              未找到匹配的设计系统规范模板
                            </div>
                          );
                        }

                        return (
                          <div style={{ width: '100%', maxWidth: 640, textAlign: 'left' }}>
                            {categories.map((category) => {
                              const items = filteredDS.filter(ds => ds.category === category);
                              return (
                                <div key={category} style={{ marginBottom: 20 }}>
                                  <div style={{
                                    fontSize: 11,
                                    fontWeight: 700,
                                    color: 'var(--text-muted)',
                                    marginBottom: 8,
                                    borderBottom: '1px solid var(--border)',
                                    paddingBottom: 4,
                                    letterSpacing: '0.05em'
                                  }}>
                                    {category}
                                  </div>
                                  <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
                                    gap: 10,
                                    width: '100%',
                                  }}>
                                    {items.map((ds) => (
                                      <div
                                        key={ds.id}
                                        onClick={() => setReplicaDesignSystem(ds.id)}
                                        style={{
                                          padding: '12px 16px',
                                          background: 'var(--bg)',
                                          border: '1px solid var(--border)',
                                          borderRadius: 8,
                                          cursor: 'pointer',
                                          textAlign: 'center',
                                          transition: 'all 0.15s ease',
                                          userSelect: 'none',
                                        }}
                                        onMouseEnter={(e) => {
                                          e.currentTarget.style.borderColor = 'var(--accent)';
                                          e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.05)';
                                        }}
                                        onMouseLeave={(e) => {
                                          e.currentTarget.style.borderColor = 'var(--border)';
                                          e.currentTarget.style.boxShadow = 'none';
                                        }}
                                      >
                                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
                                          {ds.name}
                                        </div>
                                        <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                                          {ds.category}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                  )
                )}
              </div>

              {/* Optional Design System Overlay (Only for Screenshot and URL modes) */}
              {replicaInputMode !== 'design-system' && (
                <div style={{
                  padding: '10px 16px', borderTop: '1px solid var(--border)', background: 'var(--bg-panel)',
                  display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0
                }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text)', cursor: 'pointer', userSelect: 'none', flexShrink: 0 }}>
                    <input
                      type="checkbox"
                      checked={isDsOverlayEnabled}
                      onChange={(e) => {
                        setIsDsOverlayEnabled(e.target.checked);
                        if (!e.target.checked) {
                          setReplicaDesignSystem('');
                        }
                      }}
                      style={{ cursor: 'pointer' }}
                    />
                    🎨 叠加设计规范模板 (将按选定规范的配色和风格进行复刻)
                  </label>
                  {isDsOverlayEnabled && (
                    <select
                      value={replicaDesignSystem}
                      onChange={(e) => setReplicaDesignSystem(e.target.value)}
                      style={{ ...inputStyle, flex: 1, padding: '4px 8px', fontSize: 12, height: 28, minHeight: 28 }}
                    >
                      <option value="">请选择规范模板...</option>
                      {(() => {
                        const groups: Record<string, typeof designSystems> = {};
                        designSystems.forEach((ds) => {
                          (groups[ds.category] ||= []).push(ds);
                        });
                        return Object.entries(groups)
                          .sort(([a], [b]) => a.localeCompare(b))
                          .map(([category, items]) => (
                            <optgroup key={category} label={category}>
                              {items.map((ds) => (
                                <option key={ds.id} value={ds.id}>
                                  {ds.name}
                                </option>
                              ))}
                            </optgroup>
                          ));
                      })()}
                    </select>
                  )}
                </div>
              )}
            </div>

            {/* Right: Configurations */}
            <div style={{ flex: 3, minWidth: 0, display: 'flex', flexDirection: 'column', background: 'var(--bg-panel)' }}>
              {/* Configurations header */}
              <div style={{
                height: 38,
                boxSizing: 'border-box',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 12px',
                borderBottom: '1px solid var(--border)',
                flexShrink: 0,
                background: 'var(--bg)',
              }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
                  复刻配置
                </span>
              </div>
              
              {/* Configurations content */}
              <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
                
                {/* Model selector */}
                {modelList && modelList.length > 0 && onModelChange && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
                      生成大模型
                    </div>
                    <select
                      value={currentModelKey || ''}
                      onChange={(e) => {
                        const [provider, ...idParts] = e.target.value.split('/')
                        onModelChange(provider, idParts.join('/'))
                      }}
                      style={{ ...inputStyle }}
                    >
                      {modelList.filter(m => !m.id.toLowerCase().includes("tts")).map((m) => {
                        const supportsV = m.supportsVision || isVisionModel(m.provider, m.id);
                        return (
                          <option key={`${m.provider}/${m.id}`} value={`${m.provider}/${m.id}`}>
                            {m.name} {supportsV ? ' (👁️ 视觉)' : ' (📝 文本)'}
                          </option>
                        );
                      })}
                    </select>
                    {showVisionWarning && (
                      <div style={{ color: '#f59e0b', fontSize: 11, marginTop: 4 }}>
                        ⚠️ 当前模式需要识别图片，请切换至带 👁️ 标识的视觉模型
                      </div>
                    )}
                  </div>
                )}

                {replicaInputMode !== 'design-system' && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>生成模式</div>
                    <div style={{ display: 'flex', background: 'var(--bg-hover)', padding: 3, borderRadius: 8, gap: 2, border: '1px solid var(--border)' }}>
                      <button
                        type="button"
                        onClick={() => setReplicaMode('hifi')}
                        style={{
                          flex: 1, padding: '5px 8px', fontSize: 11, fontWeight: replicaMode === 'hifi' ? 600 : 400,
                          background: replicaMode === 'hifi' ? 'var(--bg-selected)' : 'transparent',
                          border: 'none', borderRadius: 6, color: replicaMode === 'hifi' ? 'var(--text)' : 'var(--text-muted)', cursor: 'pointer',
                        }}
                      >🎨 高保真</button>
                      <button
                        type="button"
                        onClick={() => { setReplicaMode('wireframe'); setReplicaDesignSystem(''); }}
                        style={{
                          flex: 1, padding: '5px 8px', fontSize: 11, fontWeight: replicaMode === 'wireframe' ? 600 : 400,
                          background: replicaMode === 'wireframe' ? 'var(--bg-selected)' : 'transparent',
                          border: 'none', borderRadius: 6, color: replicaMode === 'wireframe' ? 'var(--text)' : 'var(--text-muted)', cursor: 'pointer',
                        }}
                      >✏️ 线框图</button>
                    </div>
                    {replicaMode === 'wireframe' && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                        线框图模式忽略设计规范，生成石墨纸背景 + 马克笔字体的手绘风格原型。
                      </div>
                    )}
                  </div>
                )}

                {/* Prompt */}
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
                    <span>复刻需求描述</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>支持快捷预设</span>
                  </div>
                  <textarea
                    placeholder="描述你想要的页面效果，如：'构建一个带有深色主题的现代SaaS仪表盘'..."
                    value={replicaPrompt}
                    onChange={(e) => setReplicaPrompt(e.target.value)}
                    style={{ ...inputStyle, minHeight: 120, resize: 'vertical' }}
                  />
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                    {[
                      { label: '黄金通用模板', text: '请完全参考截图或网页的布局、颜色、字体和组件风格，进行高精度的整体复刻。使用现代化的语义化 HTML 结构和干净的 CSS 样式，确保视觉效果高度还原，间距与比例协调，交互元素（如按钮、链接）具有自然的悬停效果。' },
                      { label: 'SaaS 暗黑风', text: '参考截图布局，复刻一个高颜值的 SaaS 仪表盘页面。使用炫酷的深色背景，磨砂玻璃卡片，主色调使用活力蓝，确保排版精致，间距得当。' },
                      { label: '现代落地页', text: '根据截图还原落地页的网格布局与首屏结构。使用明亮轻快的主题，渐变色主按钮，包含产品特性介绍卡片和用户评价轮播区。' },
                      { label: '精美个人页', text: '复刻此个人作品集页面。要求极致的极简设计，超大粗体字排版，使用优雅的单色调搭配，带有细腻的鼠标 hover 悬浮过渡动画。' }
                    ].map((preset, pIdx) => (
                      <button
                        key={pIdx}
                        type="button"
                        onClick={() => setReplicaPrompt(preset.text)}
                        style={{
                          padding: '2px 8px', borderRadius: 4, fontSize: 10,
                          border: '1px solid var(--border)', background: 'var(--bg)',
                          color: 'var(--text-muted)', cursor: 'pointer',
                          transition: 'all 0.15s',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text)'}
                        onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Collapsible reference code */}
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
                    参考代码 (可选)
                  </div>
                  <textarea
                    placeholder="粘贴现有组件的代码片段，让大模型参考结构..."
                    value={replicaCode}
                    onChange={(e) => setReplicaCode(e.target.value)}
                    style={{ ...inputStyle, minHeight: 200, resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: 11 }}
                  />
                </div>
              </div>

              {/* Generate button */}
              <div style={{ padding: 12, borderTop: '1px solid var(--border)', flexShrink: 0 }}>
                <button
                  onClick={handleReplicaGenerate}
                  disabled={!replicaPrompt.trim()}
                  style={{
                    ...btnStyle(true),
                    width: '100%',
                    opacity: !replicaPrompt.trim() ? 0.5 : 1,
                  }}
                >
                  🚀 开始{replicaMode === 'wireframe' ? '线框图' : '复刻'}生成新网页
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Style Transfer Tab */}
        {mainTab === 'style-transfer' && (
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            {/* Left: Source Content */}
            <div style={{ flex: 5, minWidth: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', background: 'var(--bg)' }}>
              {/* Source toolbar */}
              <div style={{
                height: 38,
                boxSizing: 'border-box',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 12px',
                borderBottom: '1px solid var(--border)',
                flexShrink: 0,
                background: 'var(--bg)',
              }}>
                <div style={{ display: 'flex', background: 'var(--bg-hover)', padding: 2, borderRadius: 8, gap: 2, border: '1px solid var(--border)' }}>
                  <button
                    type="button"
                    onClick={() => setStSourceInputMode('html')}
                    style={{
                      padding: '4px 10px', fontSize: 11, fontWeight: stSourceInputMode === 'html' ? 600 : 400,
                      background: stSourceInputMode === 'html' ? 'var(--bg-selected)' : 'transparent',
                      border: 'none', borderRadius: 6, color: stSourceInputMode === 'html' ? 'var(--text)' : 'var(--text-muted)', cursor: 'pointer',
                    }}
                  >📄 粘贴源 HTML</button>
                  <button
                    type="button"
                    onClick={() => setStSourceInputMode('screenshot')}
                    style={{
                      padding: '4px 10px', fontSize: 11, fontWeight: stSourceInputMode === 'screenshot' ? 600 : 400,
                      background: stSourceInputMode === 'screenshot' ? 'var(--bg-selected)' : 'transparent',
                      border: 'none', borderRadius: 6, color: stSourceInputMode === 'screenshot' ? 'var(--text)' : 'var(--text-muted)', cursor: 'pointer',
                    }}
                  >📸 上传源截图</button>
                </div>
                {(stSourceScreenshot || stSourceHtml) && (
                  <button
                    onClick={() => { setStSourceScreenshot(null); setStSourceHtml(''); setStSourceFilePath(''); }}
                    style={{
                      background: 'transparent', border: '1px solid var(--border)', borderRadius: 6,
                      color: 'var(--text-muted)', padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(239,68,68,0.5)'; e.currentTarget.style.color = 'rgb(239,68,68)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                  >
                    🔄 重置
                  </button>
                )}
              </div>

              {/* Source preview area */}
              <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {stSourceInputMode === 'screenshot' ? (
                  stSourceScreenshot ? (
                    <img src={stSourceScreenshot} alt="Source" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8, border: '1px solid var(--border)' }} />
                  ) : (
                    <label style={{
                      width: '100%', height: '100%', minHeight: 200, display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center', border: '2px dashed var(--border)',
                      borderRadius: 12, padding: 32, textAlign: 'center', background: 'var(--bg-panel)', cursor: 'pointer',
                    }}>
                      <div style={{ fontSize: 40, marginBottom: 12 }}>📸</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>上传源页面截图</div>
                      <div style={{ fontSize: 12, color: 'var(--text-dim)', maxWidth: 320, lineHeight: 1.5, marginBottom: 16 }}>
                        上传您当前页面的截图，AI 将保留其全部内容与结构，仅替换为右侧指定的风格样式。
                      </div>
                      <span style={{ cursor: 'pointer', ...btnStyle(true), textAlign: 'center', width: '100%', maxWidth: 200 }}>
                        选择本地截图
                        <input type="file" accept="image/*" onChange={handleStSourceScreenshotUpload} style={{ display: 'none' }} />
                      </span>
                    </label>
                  )
                ) : (
                  stSourceHtml ? (
                    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
                        background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text-muted)',
                      }}>
                        <span style={{ flex: 1 }}>📄 {stSourceFilePath || '已粘贴 HTML'}</span>
                        <label style={{
                          padding: '2px 8px', fontSize: 11, borderRadius: 4, cursor: 'pointer',
                          border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-muted)',
                        }}>
                          替换文件
                          <input type="file" accept=".html,.htm" onChange={handleStSourceHtmlUpload} style={{ display: 'none' }} />
                        </label>
                      </div>
                      <iframe
                        srcDoc={stSourceHtml}
                        style={{
                          flex: 1, width: '100%', border: 'none', borderRadius: 8,
                          background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                        }}
                        title="Source HTML Preview"
                        sandbox="allow-same-origin"
                      />
                    </div>
                  ) : (
                    <div style={{
                      width: '100%', height: '100%', minHeight: 200, display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center', border: '2px dashed var(--border)',
                      borderRadius: 12, padding: 32, textAlign: 'center', background: 'var(--bg-panel)',
                    }}>
                      <div style={{ fontSize: 40, marginBottom: 12 }}>📄</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>粘贴源页面 HTML</div>
                      <div style={{ fontSize: 12, color: 'var(--text-dim)', maxWidth: 320, lineHeight: 1.5, marginBottom: 16 }}>
                        粘贴或上传源页面的 HTML 代码，AI 将保留全部内容与结构，仅替换为右侧指定的风格样式。
                      </div>
                      <div style={{ display: 'flex', gap: 8, width: '100%', maxWidth: 400 }}>
                        <label style={{ cursor: 'pointer', ...btnStyle(true), textAlign: 'center', flex: 1 }}>
                          上传 HTML 文件
                          <input type="file" accept=".html,.htm" onChange={handleStSourceHtmlUpload} style={{ display: 'none' }} />
                        </label>
                      </div>
                      <div style={{ width: '100%', maxWidth: 400, marginTop: 12 }}>
                        <textarea
                          placeholder="或在此处直接粘贴 HTML 代码..."
                          value={stSourceHtml}
                          onChange={(e) => setStSourceHtml(e.target.value)}
                          style={{
                            ...inputStyle, minHeight: 80, resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.5, borderRadius: 8, padding: 10, width: '100%',
                          }}
                        />
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>

            {/* Right: Style Reference + Config */}
            <div style={{ flex: 5, minWidth: 0, display: 'flex', flexDirection: 'column', background: 'var(--bg-panel)' }}>
              {/* Ref toolbar */}
              <div style={{
                height: 38,
                boxSizing: 'border-box',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 12px',
                borderBottom: '1px solid var(--border)',
                flexShrink: 0,
                background: 'var(--bg)',
              }}>
                <div style={{ display: 'flex', background: 'var(--bg-hover)', padding: 2, borderRadius: 8, gap: 2, border: '1px solid var(--border)' }}>
                  <button
                    type="button"
                    onClick={() => { setStRefInputMode('design-system'); }}
                    style={{
                      padding: '4px 10px', fontSize: 11, fontWeight: stRefInputMode === 'design-system' ? 600 : 400,
                      background: stRefInputMode === 'design-system' ? 'var(--bg-selected)' : 'transparent',
                      border: 'none', borderRadius: 6, color: stRefInputMode === 'design-system' ? 'var(--text)' : 'var(--text-muted)', cursor: 'pointer',
                    }}
                  >🎨 规范参考</button>
                  <button
                    type="button"
                    onClick={() => setStRefInputMode('url')}
                    style={{
                      padding: '4px 10px', fontSize: 11, fontWeight: stRefInputMode === 'url' ? 600 : 400,
                      background: stRefInputMode === 'url' ? 'var(--bg-selected)' : 'transparent',
                      border: 'none', borderRadius: 6, color: stRefInputMode === 'url' ? 'var(--text)' : 'var(--text-muted)', cursor: 'pointer',
                    }}
                  >🔗 网址参考</button>
                  <button
                    type="button"
                    onClick={() => setStRefInputMode('screenshot')}
                    style={{
                      padding: '4px 10px', fontSize: 11, fontWeight: stRefInputMode === 'screenshot' ? 600 : 400,
                      background: stRefInputMode === 'screenshot' ? 'var(--bg-selected)' : 'transparent',
                      border: 'none', borderRadius: 6, color: stRefInputMode === 'screenshot' ? 'var(--text)' : 'var(--text-muted)', cursor: 'pointer',
                    }}
                  >📸 截图参考</button>
                </div>
                {(stRefScreenshot || stRefUrl.trim() || stRefDesignSystem) && (
                  <button
                    onClick={() => { setStRefScreenshot(null); setStRefUrl(''); setStRefDesignSystem(''); setDsSearch(''); }}
                    style={{
                      background: 'transparent', border: '1px solid var(--border)', borderRadius: 6,
                      color: 'var(--text-muted)', padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(239,68,68,0.5)'; e.currentTarget.style.color = 'rgb(239,68,68)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                  >
                    🔄 重置
                  </button>
                )}
              </div>

              {/* Ref preview area */}
              <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {stRefInputMode === 'screenshot' ? (
                  stRefScreenshot ? (
                    <img src={stRefScreenshot} alt="Style Reference" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8, border: '1px solid var(--border)' }} />
                  ) : (
                    <label style={{
                      width: '100%', height: '100%', minHeight: 200, display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center', border: '2px dashed var(--border)',
                      borderRadius: 12, padding: 32, textAlign: 'center', background: 'var(--bg-panel)', cursor: 'pointer',
                    }}>
                      <div style={{ fontSize: 40, marginBottom: 12 }}>🎨</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>上传风格参考截图</div>
                      <div style={{ fontSize: 12, color: 'var(--text-dim)', maxWidth: 320, lineHeight: 1.5, marginBottom: 16 }}>
                        上传目标风格的网页截图，AI 将提取其配色、字体、间距等视觉风格，应用到源页面上。
                      </div>
                      <span style={{ cursor: 'pointer', ...btnStyle(true), textAlign: 'center', width: '100%', maxWidth: 200 }}>
                        选择参考截图
                        <input type="file" accept="image/*" onChange={handleStRefScreenshotUpload} style={{ display: 'none' }} />
                      </span>
                    </label>
                  )
                ) : stRefInputMode === 'url' ? (
                  stRefScreenshot ? (
                    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', gap: 12 }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                        background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text-muted)',
                      }}>
                        <span style={{ flexShrink: 0 }}>🌐 风格来源:</span>
                        <a href={stRefUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'underline', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {stRefUrl}
                        </a>
                      </div>
                      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <img src={stRefScreenshot} alt="Style Reference" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8, border: '1px solid var(--border)' }} />
                      </div>
                    </div>
                  ) : (
                    <div style={{
                      width: '100%', height: '100%', minHeight: 200, display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center', border: '2px dashed var(--border)',
                      borderRadius: 12, padding: 32, textAlign: 'center', background: 'var(--bg-panel)',
                    }}>
                      <div style={{ fontSize: 40, marginBottom: 12 }}>🔗</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>基于网站 URL 提取风格</div>
                      <div style={{ fontSize: 12, color: 'var(--text-dim)', maxWidth: 320, lineHeight: 1.5, marginBottom: 16 }}>
                        输入参考网站 URL，AI 将截取其视觉风格并应用到源页面上。
                      </div>
                      <div style={{ display: 'flex', gap: 6, width: '100%', maxWidth: 400 }}>
                        <input
                          type="text"
                          placeholder="请输入参考网页 URL..."
                          value={stRefUrl}
                          onChange={(e) => setStRefUrl(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleStCaptureUrl(); }}
                          style={{ ...inputStyle, flex: 1 }}
                        />
                        <button
                          onClick={handleStCaptureUrl}
                          disabled={stIsCapturingRef}
                          style={{
                            ...btnStyle(),
                            opacity: stIsCapturingRef ? 0.7 : 1,
                            cursor: stIsCapturingRef ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', gap: 4,
                          }}
                        >
                          {stIsCapturingRef ? '⏳ 截图中...' : '截图'}
                        </button>
                      </div>
                    </div>
                  )
                ) : (
                  /* Design System Template Mode */
                  stRefDesignSystem ? (
                    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <iframe
                        src={`/api/design-systems/${encodeURIComponent(stRefDesignSystem)}/preview`}
                        style={{ border: 'none', width: '100%', height: '100%', background: 'var(--bg)', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}
                        title={`Design System Preview ${stRefDesignSystem}`}
                        sandbox="allow-same-origin"
                      />
                    </div>
                  ) : (
                    <div style={{
                      width: '100%', height: '100%', minHeight: 200, display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'flex-start', border: '2px dashed var(--border)',
                      borderRadius: 12, padding: 24, textAlign: 'center', background: 'var(--bg-panel)',
                      overflowY: 'auto',
                    }}>
                      <div style={{ fontSize: 40, marginBottom: 12 }}>🎨</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>选择设计规范模板</div>
                      <div style={{ fontSize: 12, color: 'var(--text-dim)', maxWidth: 320, lineHeight: 1.5, marginBottom: 16 }}>
                        选择一个设计规范作为目标风格参考，AI 将严格遵循该规范的配色、字体和组件风格。
                      </div>
                      <input
                        type="text"
                        placeholder="🔍 搜索设计系统或分类..."
                        value={dsSearch}
                        onChange={(e) => setDsSearch(e.target.value)}
                        style={{
                          width: '100%', maxWidth: 480, padding: '8px 12px', fontSize: 12, marginBottom: 20,
                          background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', outline: 'none',
                        }}
                      />
                      {(() => {
                        const filteredDS = designSystems.filter(ds =>
                          ds.name.toLowerCase().includes(dsSearch.toLowerCase()) ||
                          ds.category.toLowerCase().includes(dsSearch.toLowerCase())
                        );
                        const categories = Array.from(new Set(filteredDS.map(ds => ds.category))).sort();
                        if (filteredDS.length === 0) {
                          return <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '20px 0' }}>未找到匹配的设计系统规范模板</div>;
                        }
                        return (
                          <div style={{ width: '100%', maxWidth: 640, textAlign: 'left' }}>
                            {categories.map((category) => {
                              const items = filteredDS.filter(ds => ds.category === category);
                              return (
                                <div key={category} style={{ marginBottom: 20 }}>
                                  <div style={{
                                    fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8,
                                    borderBottom: '1px solid var(--border)', paddingBottom: 4, letterSpacing: '0.05em',
                                  }}>
                                    {category}
                                  </div>
                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10, width: '100%' }}>
                                    {items.map((ds) => (
                                      <div
                                        key={ds.id}
                                        onClick={() => setStRefDesignSystem(ds.id)}
                                        style={{
                                          padding: '12px 16px', background: 'var(--bg)', border: '1px solid var(--border)',
                                          borderRadius: 8, cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s ease', userSelect: 'none',
                                        }}
                                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.05)'; }}
                                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }}
                                      >
                                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{ds.name}</div>
                                        <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{ds.category}</div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                  )
                )}
              </div>

              {/* Optional Design System Overlay (for screenshot and URL modes) */}
              {stRefInputMode !== 'design-system' && (
                <div style={{
                  padding: '10px 16px', borderTop: '1px solid var(--border)', background: 'var(--bg-panel)',
                  display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
                }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text)', cursor: 'pointer', userSelect: 'none', flexShrink: 0 }}>
                    <input
                      type="checkbox"
                      checked={stIsDsOverlayEnabled}
                      onChange={(e) => { setStIsDsOverlayEnabled(e.target.checked); if (!e.target.checked) setStRefDesignSystem(''); }}
                      style={{ cursor: 'pointer' }}
                    />
                    🎨 叠加设计规范模板
                  </label>
                  {stIsDsOverlayEnabled && (
                    <select
                      value={stRefDesignSystem}
                      onChange={(e) => setStRefDesignSystem(e.target.value)}
                      style={{ ...inputStyle, flex: 1, padding: '4px 8px', fontSize: 12, height: 28, minHeight: 28 }}
                    >
                      <option value="">请选择规范模板...</option>
                      {(() => {
                        const groups: Record<string, typeof designSystems> = {};
                        designSystems.forEach((ds) => { (groups[ds.category] ||= []).push(ds); });
                        return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)).map(([category, items]) => (
                          <optgroup key={category} label={category}>
                            {items.map((ds) => <option key={ds.id} value={ds.id}>{ds.name}</option>)}
                          </optgroup>
                        ));
                      })()}
                    </select>
                  )}
                </div>
              )}

              {/* Config + Generate area */}
              <div style={{ borderTop: '1px solid var(--border)', padding: 16, display: 'flex', flexDirection: 'column', gap: 12, flexShrink: 0, maxHeight: '40%', overflowY: 'auto' }}>
                {/* Model selector */}
                {modelList && modelList.length > 0 && onModelChange && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>生成大模型</div>
                    <select
                      value={currentModelKey || ''}
                      onChange={(e) => { const [provider, ...idParts] = e.target.value.split('/'); onModelChange(provider, idParts.join('/')); }}
                      style={{ ...inputStyle, padding: '4px 8px', fontSize: 12 }}
                    >
                      {modelList.filter(m => !m.id.toLowerCase().includes("tts")).map((m) => {
                        const supportsV = m.supportsVision || isVisionModel(m.provider, m.id);
                        return (
                          <option key={`${m.provider}/${m.id}`} value={`${m.provider}/${m.id}`}>
                            {m.name} {supportsV ? ' (👁️ 视觉)' : ' (📝 文本)'}
                          </option>
                        );
                      })}
                    </select>
                    {showVisionWarning && (
                      <div style={{ color: '#f59e0b', fontSize: 11, marginTop: 4 }}>
                        ⚠️ 当前模式需要识别图片，请切换至带 👁️ 标识的视觉模型
                      </div>
                    )}
                  </div>
                )}

                {/* Prompt */}
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>风格复刻需求描述</div>
                  <textarea
                    placeholder="描述你的风格复刻需求，如：'将源页面改为参考截图的深色主题风格，保持所有文字和布局不变'..."
                    value={stRefPrompt}
                    onChange={(e) => setStRefPrompt(e.target.value)}
                    style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
                  />
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                    {[
                      { label: '黄金通用模板', text: '将源页面的视觉设计完全迁移为参考截图的风格。请使用其配色方案、字体、圆角、间距和阴影效果，但必须保持源页面的所有文本内容、功能组件和排版结构100%一致。' },
                      { label: '深色主题迁移', text: '将源页面的全部样式替换为参考风格的深色主题，保持所有文字内容、层级结构和交互元素不变。' },
                      { label: '品牌风格切换', text: '将源页面的视觉风格（配色、字体、按钮样式、卡片圆角与阴影）替换为参考品牌的设计系统风格。' },
                      { label: '现代极简改版', text: '将源页面改为参考截图的极简现代风格，使用大留白、细线条、精致的排版层次。' },
                    ].map((preset, pIdx) => (
                      <button
                        key={pIdx}
                        type="button"
                        onClick={() => setStRefPrompt(preset.text)}
                        style={{
                          padding: '2px 8px', borderRadius: 4, fontSize: 10,
                          border: '1px solid var(--border)', background: 'var(--bg)',
                          color: 'var(--text-muted)', cursor: 'pointer', transition: 'all 0.15s',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text)'}
                        onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Target path */}
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>输出目录 (可选)</div>
                  <input
                    type="text"
                    placeholder="默认 Temp/New_..."
                    value={stTargetPath}
                    onChange={(e) => setStTargetPath(e.target.value)}
                    style={{ ...inputStyle, fontFamily: 'var(--font-mono)', fontSize: 12 }}
                  />
                </div>

                {/* Generate button */}
                <button
                  onClick={handleStGenerate}
                  disabled={!stRefPrompt.trim() || (!stSourceScreenshot && !stSourceHtml)}
                  style={{
                    ...btnStyle(true),
                    width: '100%',
                    opacity: (!stRefPrompt.trim() || (!stSourceScreenshot && !stSourceHtml)) ? 0.5 : 1,
                  }}
                >
                  🚀 开始风格复刻生成
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Cloner Tab */}
        {mainTab === 'cloner' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ flex: 1, padding: '24px', display: 'flex', flexDirection: 'column', gap: 20, overflowY: 'auto' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                🧲 网站复刻 (Next.js 完整项目)
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                自动初始化包含 Next.js 16 + Tailwind v4 + shadcn/ui 的项目骨架，通过 AI Agent 逆向工程并克隆目标网站的页面结构、样式与资产。
              </div>

              {/* Model selector */}
              {modelList && modelList.length > 0 && onModelChange && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
                    生成大模型
                  </div>
                  <select
                    value={currentModelKey || ''}
                    onChange={(e) => {
                      const [provider, ...idParts] = e.target.value.split('/')
                      onModelChange(provider, idParts.join('/'))
                    }}
                    style={{ ...inputStyle }}
                  >
                    {modelList.filter(m => !m.id.toLowerCase().includes("tts")).map((m) => {
                      const supportsV = m.supportsVision || isVisionModel(m.provider, m.id);
                      return (
                        <option key={`${m.provider}/${m.id}`} value={`${m.provider}/${m.id}`}>
                          {m.name} {supportsV ? ' (👁️ 视觉)' : ' (📝 文本)'}
                        </option>
                      );
                    })}
                  </select>
                  {showVisionWarning && (
                    <div style={{ color: '#f59e0b', fontSize: 11, marginTop: 4 }}>
                      ⚠️ 当前模式需要识别图片，请切换至带 👁️ 标识的视觉模型
                    </div>
                  )}
                </div>
              )}

              {/* Output Language */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>输出语言</div>
                <div style={{ display: 'flex', background: 'var(--bg-hover)', padding: 3, borderRadius: 8, gap: 2, border: '1px solid var(--border)', maxWidth: 200 }}>
                  <button
                    type="button"
                    onClick={() => setCloneLanguage('zh')}
                    style={{
                      flex: 1, padding: '5px 12px', fontSize: 12, fontWeight: cloneLanguage === 'zh' ? 600 : 400,
                      background: cloneLanguage === 'zh' ? 'var(--bg-selected)' : 'transparent',
                      border: 'none', borderRadius: 6, color: cloneLanguage === 'zh' ? 'var(--text)' : 'var(--text-muted)', cursor: 'pointer',
                    }}
                  >🇨🇳 中文</button>
                  <button
                    type="button"
                    onClick={() => setCloneLanguage('en')}
                    style={{
                      flex: 1, padding: '5px 12px', fontSize: 12, fontWeight: cloneLanguage === 'en' ? 600 : 400,
                      background: cloneLanguage === 'en' ? 'var(--bg-selected)' : 'transparent',
                      border: 'none', borderRadius: 6, color: cloneLanguage === 'en' ? 'var(--text)' : 'var(--text-muted)', cursor: 'pointer',
                    }}
                  >🇺🇸 English</button>
                </div>
              </div>

              {/* Target URL */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
                  目标网站 URL
                </div>
                <input
                  type="url"
                  placeholder="https://example.com"
                  value={replicaUrl}
                  onChange={(e) => {
                    setReplicaUrl(e.target.value);
                    if (e.target.value.trim() && !nextjsTargetPath) {
                      try {
                        const hostname = new URL(e.target.value).hostname;
                        const baseDir = workspaceCwd ? workspaceCwd.replace(/\//g, '\\') : 'C:\\Users\\demon\\Desktop';
                        const targetDir = baseDir.endsWith('cloned-websites') || baseDir.endsWith('cloned-websites\\')
                          ? `${baseDir.replace(/\\$/, '')}\\${hostname}`
                          : `${baseDir.replace(/\\$/, '')}\\cloned-websites\\${hostname}`;
                        setNextjsTargetPath(targetDir);
                      } catch {}
                    }
                  }}
                  style={inputStyle}
                />
              </div>

              {/* Project Target Directory */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
                  项目保存路径
                </div>
                <input
                  type="text"
                  placeholder={workspaceCwd ? `${workspaceCwd.replace(/\//g, '\\')}\\cloned-websites\\example.com` : "C:\\Users\\demon\\Desktop\\cloned-websites\\example.com"}
                  value={nextjsTargetPath}
                  onChange={(e) => setNextjsTargetPath(e.target.value)}
                  style={{ ...inputStyle, fontFamily: 'var(--font-mono)', fontSize: 12 }}
                />
              </div>

              {/* Description banner */}
              <div style={{
                padding: '12px 14px',
                background: 'rgba(37,99,235,0.06)',
                border: '1px solid rgba(37,99,235,0.2)',
                borderRadius: 8,
                fontSize: 11,
                color: 'var(--text)',
                lineHeight: 1.6,
              }}>
                <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 12, color: 'var(--accent)' }}>
                  ⚡ 自动化克隆流程说明
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div>① 系统自动在目标路径创建 Next.js 16 + Tailwind v4 + shadcn/ui 脚手架项目</div>
                  <div>② 配置 <code style={{ background: 'var(--bg-hover)', padding: '1px 4px', borderRadius: 3 }}>.agents/skills/clone-website</code> 专属技能与 AI 规范</div>
                  <div>③ 初始化 Git 仓库并提交脚手架代码（用于 Builder 的 Git worktree 支持）</div>
                  <div>④ 开启新会话，AI 自动执行 <code style={{ background: 'var(--bg-hover)', padding: '1px 4px', borderRadius: 3 }}>/clone-website &lt;url&gt;</code> 命令</div>
                  <div>⑤ 逐像素逆向提取并构建目标网站（自动下载图片/视频/SVG，并由多 Builder 协同重构）</div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={handleReplicaGenerate}
                disabled={!replicaUrl.trim()}
                style={{
                  ...btnStyle(true),
                  padding: '8px 24px',
                  opacity: !replicaUrl.trim() ? 0.5 : 1,
                }}
              >
                🚀 开始 Next.js 项目克隆
              </button>
            </div>
          </div>
        )}

        {/* Critique Tab */}
        {mainTab === 'critique' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Input area */}
            <div style={{ flex: 1, padding: '24px', display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                🔍 5维度设计评审
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                上传截图或输入 URL，AI 将从「哲学一致性 / 视觉层级 / 细节执行 / 功能性 / 创新性」5个维度给出 0-10 评分，并输出带雷达图的 HTML 评审报告。
              </div>

              {/* Mode switcher */}
              <div style={{ display: 'flex', background: 'var(--bg-hover)', padding: 4, borderRadius: 10, gap: 4, border: '1px solid var(--border)' }}>
                <button
                  type="button"
                  onClick={() => setCritiqueInputMode('image')}
                  style={{
                    flex: 1, padding: '6px 12px', fontSize: 12, fontWeight: critiqueInputMode === 'image' ? 600 : 400,
                    background: critiqueInputMode === 'image' ? 'var(--bg-selected)' : 'transparent',
                    border: 'none', borderRadius: 7, color: critiqueInputMode === 'image' ? 'var(--text)' : 'var(--text-muted)', cursor: 'pointer',
                  }}
                >📷 截图上传</button>
                <button
                  type="button"
                  onClick={() => setCritiqueInputMode('url')}
                  style={{
                    flex: 1, padding: '6px 12px', fontSize: 12, fontWeight: critiqueInputMode === 'url' ? 600 : 400,
                    background: critiqueInputMode === 'url' ? 'var(--bg-selected)' : 'transparent',
                    border: 'none', borderRadius: 7, color: critiqueInputMode === 'url' ? 'var(--text)' : 'var(--text-muted)', cursor: 'pointer',
                  }}
                >🔗 URL 预览</button>
              </div>

              {/* Image upload */}
              {critiqueInputMode === 'image' && (
                <div>
                  {critiqueScreenshot ? (
                    <div style={{ position: 'relative' }}>
                      <img src={critiqueScreenshot} alt="critique target" style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border)', maxHeight: 280, objectFit: 'contain', background: 'var(--bg)' }} />
                      <button
                        onClick={() => setCritiqueScreenshot(null)}
                        style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: 6, color: '#fff', padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}
                      >移除</button>
                    </div>
                  ) : (
                    <label style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      border: '2px dashed var(--border)', borderRadius: 12, padding: '32px 16px', cursor: 'pointer', gap: 8,
                      background: 'var(--bg)', color: 'var(--text-muted)', fontSize: 13,
                    }}>
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></svg>
                      <span>点击上传截图</span>
                      <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = (ev) => setCritiqueScreenshot(ev.target?.result as string);
                        reader.readAsDataURL(file);
                      }} />
                    </label>
                  )}
                </div>
              )}

              {/* URL input */}
              {critiqueInputMode === 'url' && (
                <input
                  type="url"
                  placeholder="https://example.com"
                  value={critiqueUrl}
                  onChange={(e) => setCritiqueUrl(e.target.value)}
                  style={{
                    width: '100%', padding: '10px 14px', fontSize: 13, borderRadius: 8,
                    border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', outline: 'none', boxSizing: 'border-box',
                  }}
                />
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={() => {
                  const hasInput = critiqueInputMode === 'image' ? !!critiqueScreenshot : !!critiqueUrl.trim();
                  if (!hasInput) return;
                  onGenerateCritique?.({
                    screenshot: critiqueInputMode === 'image' ? critiqueScreenshot ?? undefined : undefined,
                    url: critiqueInputMode === 'url' ? critiqueUrl : undefined,
                  });
                }}
                disabled={critiqueInputMode === 'image' ? !critiqueScreenshot : !critiqueUrl.trim()}
                style={{
                  padding: '8px 20px', fontSize: 13, fontWeight: 600, borderRadius: 8,
                  background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer',
                  opacity: (critiqueInputMode === 'image' ? !critiqueScreenshot : !critiqueUrl.trim()) ? 0.4 : 1,
                }}
              >
                开始评审
              </button>
            </div>
          </div>
        )}
        {/* PPT Tab */}
        {mainTab === 'ppt' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ flex: 1, padding: '24px', display: 'flex', flexDirection: 'column', gap: 20, overflowY: 'auto' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                📑 HTML PPT Studio
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                输入主题和配置，AI 将生成一份精美的单文件 HTML 演示文稿，支持键盘导航和动画切换。
              </div>

              {/* Topic */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>主题 / 内容简述</div>
                <input
                  type="text"
                  placeholder="例：AI Agent 技术分享、2026 Q2 业绩复盘…"
                  value={pptTopic}
                  onChange={e => setPptTopic(e.target.value)}
                  style={inputStyle}
                />
              </div>

              {/* Audience */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>受众（可选）</div>
                <input
                  type="text"
                  placeholder="例：工程师团队、VC 投资人、小红书用户…"
                  value={pptAudience}
                  onChange={e => setPptAudience(e.target.value)}
                  style={inputStyle}
                />
              </div>

              {/* Model selector */}
              {modelList && modelList.length > 0 && onModelChange && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>生成大模型</div>
                  <select
                    value={currentModelKey || ''}
                    onChange={(e) => { const [provider, ...idParts] = e.target.value.split('/'); onModelChange(provider, idParts.join('/')); }}
                    style={inputStyle}
                  >
                    {modelList.filter(m => !m.id.toLowerCase().includes("tts")).map((m) => {
                      const supportsV = m.supportsVision || isVisionModel(m.provider, m.id);
                      return (
                        <option key={`${m.provider}/${m.id}`} value={`${m.provider}/${m.id}`}>
                          {m.name} {supportsV ? ' (👁️ 视觉)' : ' (📝 文本)'}
                        </option>
                      );
                    })}
                  </select>
                  {showVisionWarning && (
                    <div style={{ color: '#f59e0b', fontSize: 11, marginTop: 4 }}>
                      ⚠️ 当前模式需要识别图片，请切换至带 👁️ 标识的视觉模型
                    </div>
                  )}
                </div>
              )}

              {/* Theme */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>视觉主题</div>
                <select
                  value={pptTheme}
                  onChange={e => setPptTheme(e.target.value)}
                  style={inputStyle}
                >
                  <optgroup label="深色 · 技术">
                    <option value="tokyo-night">Tokyo Night — 蓝夜科技感</option>
                    <option value="dracula">Dracula — 经典紫红深色</option>
                    <option value="catppuccin-mocha">Catppuccin Mocha — 开发者友好深色</option>
                    <option value="terminal-green">Terminal Green — 绿屏终端复古</option>
                    <option value="nord">Nord — 北欧清冷蓝</option>
                    <option value="gruvbox-dark">Gruvbox Dark — 暖棕复古深色</option>
                    <option value="rose-pine">Rosé Pine — 柔和紫粉深色</option>
                    <option value="vaporwave">Vaporwave — 蒸汽波霓虹紫</option>
                    <option value="cyberpunk-neon">Cyberpunk Neon — 赛博霓虹</option>
                  </optgroup>
                  <optgroup label="浅色 · 专业">
                    <option value="minimal-white">Minimal White — 极简白（内部汇报）</option>
                    <option value="corporate-clean">Corporate Clean — 企业蓝正式汇报</option>
                    <option value="pitch-deck-vc">Pitch Deck VC — YC 风融资路演</option>
                    <option value="editorial-serif">Editorial Serif — 杂志风衬线高级感</option>
                    <option value="academic-paper">Academic Paper — 学术论文风</option>
                    <option value="swiss-grid">Swiss Grid — 瑞士网格 Helvetica</option>
                    <option value="solarized-light">Solarized Light — 暖调浅色护眼</option>
                    <option value="catppuccin-latte">Catppuccin Latte — 柔和奶咖浅色</option>
                  </optgroup>
                  <optgroup label="小红书 · 生活">
                    <option value="xiaohongshu-white">小红书白 — 暖红衬线图文</option>
                    <option value="soft-pastel">Soft Pastel — 马卡龙柔和</option>
                    <option value="rainbow-gradient">Rainbow Gradient — 彩虹渐变欢乐</option>
                    <option value="sunset-warm">Sunset Warm — 橘珊瑚渐变</option>
                  </optgroup>
                  <optgroup label="高冲击力 · 创意">
                    <option value="neo-brutalism">Neo Brutalism — 厚描边硬阴影</option>
                    <option value="glassmorphism">Glassmorphism — 毛玻璃苹果风</option>
                    <option value="aurora">Aurora — 极光渐变</option>
                    <option value="blueprint">Blueprint — 工程蓝图网格</option>
                    <option value="y2k-chrome">Y2K Chrome — 千禧铬金属银</option>
                    <option value="retro-tv">Retro TV — 复古显像管扫描线</option>
                    <option value="news-broadcast">News Broadcast — 新闻播报风格</option>
                    <option value="memphis-pop">Memphis Pop — 孟菲斯波普几何</option>
                    <option value="magazine-bold">Magazine Bold — 杂志大标题冲击</option>
                    <option value="japanese-minimal">Japanese Minimal — 和风极简侘寂</option>
                    <option value="midcentury">Midcentury — 世纪中期现代复古</option>
                    <option value="engineering-whiteprint">Engineering Whiteprint — 工程白图蓝线</option>
                    <option value="arctic-cool">Arctic Cool — 冰川冷色石板蓝</option>
                    <option value="bauhaus">Bauhaus — 包豪斯几何原色</option>
                    <option value="sharp-mono">Sharp Mono — 锐利黑白高对比</option>
                  </optgroup>
                </select>
              </div>

              {/* Template */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>Deck 模板（结构）</div>
                <select
                  value={pptTemplate}
                  onChange={e => setPptTemplate(e.target.value)}
                  style={inputStyle}
                >
                  <option value="tech-sharing">Tech Sharing — 技术分享（封面/背景/方案/Demo/总结）</option>
                  <option value="pitch-deck">Pitch Deck — 融资路演（问题/方案/市场/团队/融资）</option>
                  <option value="product-launch">Product Launch — 产品发布（亮点/功能/对比/CTA）</option>
                  <option value="weekly-report">Weekly Report — 周报复盘（目标/进展/风险/下周计划）</option>
                  <option value="xhs-post">小红书图文 — 3:4 竖版图文（封面/内容/种草/结尾）</option>
                  <option value="course-module">Course Module — 课程模块（学习目标/讲解/练习/小结）</option>
                  <option value="presenter-mode-reveal">演讲者模式 — 含逐字稿（S键弹出提词器）</option>
                </select>
              </div>

              {/* Slides count */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>页数：{pptSlides} 页</div>
                <input
                  type="range" min={4} max={20} value={pptSlides}
                  onChange={e => setPptSlides(Number(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--accent)' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>
                  <span>4</span><span>20</span>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                disabled={!pptTopic.trim()}
                onClick={() => {
                  if (!pptTopic.trim() || !onGeneratePPT) return;

                  const templateDescMap: Record<string, string> = {
                    'tech-sharing': 'tech-sharing（技术分享：封面 → 背景/问题 → 解决方案 → 核心模块讲解 × 3 → Demo/效果 → 总结/Q&A）',
                    'pitch-deck': 'pitch-deck（融资路演：封面 → 问题 → 解决方案 → 市场规模 → 产品/Demo → 商业模式 → 竞争壁垒 → 团队 → 融资计划）',
                    'product-launch': 'product-launch（产品发布：封面 → 痛点 → 产品亮点 → 核心功能 × 3 → 对比竞品 → 价格/CTA）',
                    'weekly-report': 'weekly-report（周报复盘：封面 → 本周目标 → 完成进展 → 数据指标 → 风险/阻塞 → 下周计划）',
                    'xhs-post': 'xhs-post（小红书图文 3:4 竖版：封面卡片 → 内容卡片 × 3-4 → 种草/结尾卡片）',
                    'course-module': 'course-module（课程模块：封面 → 学习目标 → 知识讲解 × 3 → 案例/练习 → 小结/作业）',
                    'presenter-mode-reveal': 'presenter-mode-reveal（演讲者模式：每页含 <div class="notes"> 逐字稿 150-300 字，S 键弹出提词器窗口）',
                  };

                  const prompt = `请用 html-ppt skill 生成一份完整的单文件 HTML 演示文稿。

## 内容要求
- 主题：${pptTopic}
${pptAudience ? `- 目标受众：${pptAudience}` : ''}
- 页数：${pptSlides} 页

## 技术规格
- 视觉主题：${pptTheme}（对应 assets/themes/${pptTheme}.css）
- Deck 模板结构：${templateDescMap[pptTemplate] || pptTemplate}
- 必须是**单文件 HTML**，所有 CSS/JS **inline 内嵌**，不引用外部文件
- 完整实现键盘导航（← →）、幻灯片切换动画
- 每张 slide 为 \`<section class="slide">\` 元素，默认隐藏只显示 .is-active

## 输出规范
- 输出一段话说明 deck 结构，然后直接给出完整 HTML
- HTML 以 \`<!doctype html>\` 开头，\`</html>\` 结尾
- 不要截断，必须完整输出所有 ${pptSlides} 页内容
${pptTemplate === 'presenter-mode-reveal' ? '- 每页必须有 <div class="notes"> 逐字稿，150-300 字，口语风格' : ''}
${pptTemplate === 'xhs-post' ? '- 使用 3:4 竖版尺寸（width:1080px, height:1440px），小红书图文卡片风格' : ''}`;

                  onGeneratePPT(prompt);
                }}
                style={{
                  ...btnStyle(true),
                  opacity: !pptTopic.trim() ? 0.5 : 1,
                  cursor: !pptTopic.trim() ? 'not-allowed' : 'pointer',
                }}
              >
                🎞 生成 PPT
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
