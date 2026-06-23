import type { CriticIssue, CritiqueResult } from './types';

export function generateCodeForIssue(issue: CriticIssue): string {
  if (issue.code) return issue.code;

  const lines: string[] = [];
  lines.push(`/* ${issue.title} */`);

  switch (issue.dimension) {
    case 'color':
      lines.push(`/* Fix color: ${issue.recommended} */`);
      break;
    case 'typography':
      lines.push(`/* Fix typography: ${issue.recommended} */`);
      break;
    case 'spacing':
      lines.push(`/* Fix spacing: ${issue.recommended} */`);
      break;
    default:
      lines.push(`/* ${issue.recommended} */`);
  }

  return lines.join('\n');
}

export function generateTaskBrief(result: CritiqueResult): string {
  const lines: string[] = [];
  lines.push(`# Design Task Brief`);
  lines.push('');
  lines.push(`Score: ${result.score}/10`);
  lines.push(`Page Type: ${result.pageType}`);
  lines.push(`Mood: ${result.mood}`);
  lines.push('');
  lines.push(`## Issues (${result.issues.length})`);

  for (const issue of result.issues) {
    lines.push(`- [${issue.severity}] ${issue.title}`);
    lines.push(`  Current: ${issue.current}`);
    lines.push(`  Recommended: ${issue.recommended}`);
  }

  return lines.join('\n');
}

export function generateDesignMd(result: CritiqueResult, brandName: string): string {
  const lines: string[] = [];
  lines.push(`# Design Analysis`);
  lines.push('');
  lines.push(`Brand: ${brandName}`);
  lines.push(`Score: ${result.score}/10`);
  lines.push('');
  lines.push(`## 设计分析概览`);
  lines.push(result.summary);

  return lines.join('\n');
}
