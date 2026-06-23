'use client';

import { useState, useRef, useCallback } from 'react';
import type { UserSelection } from './AnnotatedImage';

const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩',
  '⑪', '⑫', '⑬', '⑭', '⑮', '⑯', '⑰', '⑱', '⑲', '⑳'];

interface SelectableOverlayProps {
  imageUrl: string;
  onSelectionsChange: (selections: UserSelection[]) => void;
  highlightedId?: number | null;
  onHoverSelection?: (id: number | null) => void;
  selectModeActive?: boolean;
}

export function SelectableOverlay({
  imageUrl,
  onSelectionsChange,
  highlightedId,
  onHoverSelection,
  selectModeActive = false,
}: SelectableOverlayProps) {
  const [selections, setSelections] = useState<UserSelection[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [currentEnd, setCurrentEnd] = useState<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);

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
      const newSel: UserSelection = { id: nextId.current++, x, y, w, h };
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

  const previewSel = drawing && start && currentEnd ? {
    id: -1,
    x: Math.min(start.x, currentEnd.x),
    y: Math.min(start.y, currentEnd.y),
    w: Math.abs(currentEnd.x - start.x),
    h: Math.abs(currentEnd.y - start.y),
  } : null;

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      style={{ position: 'relative', display: 'inline-block', cursor: selectModeActive ? 'crosshair' : 'default', userSelect: 'none' }}
    >
      <img src={imageUrl} alt="Screenshot" style={{ maxWidth: '100%', display: 'block' }} draggable={false} />
      {selections.map((sel, idx) => renderSelection(sel, idx))}
      {previewSel && previewSel.w > 0.005 && previewSel.h > 0.005 && renderSelection(previewSel, selections.length, true)}
    </div>
  );
}
