'use client';

import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import type { UserSelection } from './AnnotatedImage';

const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩',
  '⑪', '⑫', '⑬', '⑭', '⑮', '⑯', '⑰', '⑱', '⑲', '⑳'];

interface HtmlPreviewOverlayProps {
  htmlSource: string;
  onSelectionsChange: (selections: UserSelection[]) => void;
  highlightedId?: number | null;
  onHoverSelection?: (id: number | null) => void;
  selectModeActive?: boolean;
}

export function HtmlPreviewOverlay({
  htmlSource,
  onSelectionsChange,
  highlightedId,
  onHoverSelection,
  selectModeActive = false,
}: HtmlPreviewOverlayProps) {
  const [selections, setSelections] = useState<UserSelection[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [currentEnd, setCurrentEnd] = useState<{ x: number; y: number } | null>(null);
  const [iframeContentHeight, setIframeContentHeight] = useState(600);
  const containerRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);

  useEffect(() => {
    setIframeContentHeight(600);
  }, [htmlSource]);

  const handleIframeLoad = useCallback((e: React.SyntheticEvent<HTMLIFrameElement>) => {
    const iframe = e.currentTarget;
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (doc) {
        // Inject styles to disable internal scrolling on html/body and allow natural overflow
        const style = doc.createElement('style');
        style.setAttribute('data-injected-style', 'true');
        style.textContent = `
          html, body, .app, .main-layout, .content-area, .scroll-content {
            overflow: visible !important;
            height: auto !important;
            max-height: none !important;
          }
        `;
        doc.head.appendChild(style);

        setTimeout(() => {
          const height = Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight, 600);
          setIframeContentHeight(height);
        }, 100);
      }
    } catch (err) {
      console.error("Failed to read iframe scroll height:", err);
    }
  }, []);

  const getRelativePos = useCallback((e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!selectModeActive) return;
    e.preventDefault();
    const pos = getRelativePos(e);
    setStart(pos);
    setCurrentEnd(pos);
    setDrawing(true);
  }, [getRelativePos, selectModeActive]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!selectModeActive || !drawing) return;
    setCurrentEnd(getRelativePos(e));
  }, [drawing, getRelativePos, selectModeActive]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (!selectModeActive || !drawing || !start) return;
    const end = getRelativePos(e);
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const w = Math.abs(end.x - start.x);
    const h = Math.abs(end.y - start.y);

    if (w > 0.005 && h > 0.005) {
      let elementHtml: string | undefined = undefined;
      try {
        const iframe = containerRef.current?.querySelector('iframe');
        const doc = iframe?.contentDocument || iframe?.contentWindow?.document;
        if (iframe && doc) {
          const rect = iframe.getBoundingClientRect();
          const centerX = (x + w / 2) * rect.width;
          const centerY = (y + h / 2) * rect.height;
          let el = doc.elementFromPoint(centerX, centerY);
          if (el) {
            // Walk out of SVG namespace/elements to parent standard HTML element
            while (el && (el.namespaceURI?.includes('svg') || el.tagName.toLowerCase() === 'svg')) {
              if (el.parentElement) {
                el = el.parentElement;
              } else {
                break;
              }
            }
            if (el) {
              let outer = el.outerHTML;
              if (outer.length > 400) {
                const cloned = el.cloneNode(false) as Element;
                const text = el.textContent?.trim().replace(/\s+/g, ' ');
                const textDesc = text ? ` <!-- Text content: "${text.slice(0, 80)}${text.length > 80 ? '...' : ''}" -->` : '';
                outer = cloned.outerHTML + textDesc;
              }
              elementHtml = outer;
            }
          }
        }
      } catch (err) {
        console.error("Failed to extract HTML element under selection:", err);
      }

      const newSel: UserSelection = { id: nextId.current++, x, y, w, h, elementHtml };
      const updated = [...selections, newSel];
      setSelections(updated);
      onSelectionsChange(updated);
    }

    setDrawing(false);
    setStart(null);
    setCurrentEnd(null);
  }, [drawing, start, selections, getRelativePos, onSelectionsChange, selectModeActive]);

  const handleDelete = useCallback((e: React.MouseEvent, selId: number) => {
    e.stopPropagation();
    const updated = selections.filter((s) => s.id !== selId);
    setSelections(updated);
    onSelectionsChange(updated);
  }, [selections, onSelectionsChange]);


  const previewSel = drawing && start && currentEnd ? {
    id: -1,
    x: Math.min(start.x, currentEnd.x),
    y: Math.min(start.y, currentEnd.y),
    w: Math.abs(currentEnd.x - start.x),
    h: Math.abs(currentEnd.y - start.y),
  } : null;

  const renderSelection = (sel: UserSelection, idx: number, isPreview = false) => {
    const label = CIRCLED[idx] || `${idx + 1}`;
    const isHighlighted = sel.id === highlightedId;
    return (
      <div
        key={sel.id}
        onMouseEnter={!isPreview ? () => onHoverSelection?.(sel.id) : undefined}
        onMouseLeave={!isPreview ? () => onHoverSelection?.(null) : undefined}
        style={{
          position: 'absolute',
          left: `${sel.x * 100}%`,
          top: `${sel.y * 100}%`,
          width: `${sel.w * 100}%`,
          height: `${sel.h * 100}%`,
          border: isPreview
            ? '1.5px dashed rgba(37,99,235,0.5)'
            : isHighlighted
              ? '2.5px solid var(--accent)'
              : '2px solid rgba(37,99,235,0.8)',
          background: isPreview
            ? 'rgba(37,99,235,0.05)'
            : isHighlighted
              ? 'rgba(37,99,235,0.18)'
              : 'rgba(37,99,235,0.08)',
          borderRadius: 4,
          pointerEvents: isPreview ? 'none' : 'auto',
          boxShadow: isHighlighted ? '0 0 10px rgba(37,99,235,0.4)' : 'none',
          transition: 'all 0.15s ease',
        }}
      >
        {!isPreview && (
          <>
            <span style={{
              position: 'absolute',
              top: -1,
              left: -1,
              background: isHighlighted ? 'var(--accent)' : 'rgba(37,99,235,0.9)',
              color: '#fff',
              fontSize: 12,
              fontWeight: 700,
              borderRadius: '0 0 6px 0',
              padding: '2px 6px',
              lineHeight: 1.2,
              userSelect: 'none',
              boxShadow: isHighlighted ? '0 2px 4px rgba(0,0,0,0.15)' : 'none',
            }}>
              {label}
            </span>
            <span
              onClick={(e) => handleDelete(e, sel.id)}
              style={{
                position: 'absolute',
                top: -1,
                right: -1,
                background: 'rgba(239,68,68,0.85)',
                color: '#fff',
                fontSize: 10,
                fontWeight: 600,
                borderRadius: '0 0 0 4px',
                padding: '2px 6px',
                cursor: 'pointer',
                lineHeight: 1.2,
                userSelect: 'none',
                boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
              }}
            >
              ✕
            </span>
          </>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Parent viewport: scrollable parent wrapper container */}
        <div style={{
          overflow: 'auto',
          flex: 1,
          background: '#fff',
        }}>
          {/* Inner relative container: matches iframe content height */}
          <div
            ref={containerRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            style={{
              position: 'relative',
              height: iframeContentHeight,
              cursor: selectModeActive ? 'crosshair' : 'default',
              userSelect: selectModeActive ? 'none' : 'auto',
            }}
          >
            <iframe
              srcDoc={htmlSource}
              onLoad={handleIframeLoad}
              sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
                background: '#fff',
                pointerEvents: selectModeActive ? 'none' : 'auto',
              }}
            />
            {/* Canvas overlay: drawing layer, overlayed on top of iframe */}
            <div style={{
              position: 'absolute',
              inset: 0,
              zIndex: 10,
              pointerEvents: selectModeActive ? 'auto' : 'none',
            }}>
              {selections.map((sel, idx) => renderSelection(sel, idx))}
              {previewSel && previewSel.w > 0.005 && previewSel.h > 0.005 && renderSelection(previewSel, selections.length, true)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
