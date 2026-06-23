'use client';

import type { CriticIssue } from '@/lib/design-critic/types';

interface IssueCardProps {
  issue: CriticIssue;
  selected?: boolean;
  onToggle?: (selected: boolean) => void;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  major: '#f59e0b',
  minor: '#6b7280',
};

const DIMENSION_LABELS: Record<string, string> = {
  color: '色彩',
  typography: '字体排版',
  spacing: '间距',
  hierarchy: '视觉层级',
  consistency: '一致性',
  accessibility: '无障碍',
  pattern: '设计模式',
};

export function IssueCard({ issue, selected = false, onToggle }: IssueCardProps) {
  return (
    <div
      onClick={() => onToggle?.(!selected)}
      style={{
        padding: '10px 12px',
        border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 8,
        cursor: onToggle ? 'pointer' : 'default',
        background: selected ? 'rgba(37,99,235,0.05)' : 'var(--bg-panel)',
        transition: 'border-color 0.15s, background 0.15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        {onToggle && (
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => onToggle(e.target.checked)}
            onClick={(e) => e.stopPropagation()}
            style={{ cursor: 'pointer' }}
          />
        )}
        <span style={{
          fontSize: 10,
          fontWeight: 600,
          color: SEVERITY_COLORS[issue.severity] || '#6b7280',
          textTransform: 'uppercase',
        }}>
          {issue.severity}
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>
          {DIMENSION_LABELS[issue.dimension] || issue.dimension}
        </span>
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
        {issue.title}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        <div><strong>现状:</strong> {issue.current}</div>
        <div><strong>建议:</strong> {issue.recommended}</div>
      </div>
    </div>
  );
}
