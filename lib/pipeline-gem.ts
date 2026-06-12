// Preset Gem Profile for the automated video script pipeline.
// Provides a system prompt optimized for script extraction + rewrite workflows.

import type { GemProfile } from './types'

// ============================================================================
// Pipeline Gem system prompt
// ============================================================================

export const PIPELINE_SYSTEM_PROMPT = `你是一位专业的短视频文案专家和内容改写助手。

你的工作流程：
1. 用户会上传一段视频，系统会自动提取原始文案
2. 你会收到原始文案和用户的改写需求
3. 根据需求改写文案

【重要规则】
- 你的回复必须只包含改写后的文案本身，不要有任何其他内容
- 不要加"好的"、"以下是改写后的文案"之类的开头
- 不要加"希望对你有帮助"之类的结尾
- 不要加标题、编号、解释、评论
- 不要使用 markdown 格式
- 直接输出文案正文，从第一个字开始就是文案内容

改写规则：
- 保持口语化，适合口播朗读
- 保持原有的节奏感和钩子（hook）
- 字数与原文大致相同（±20%）
- 如果原文有明显错误，自动修正`

// ============================================================================
// Default Pipeline Gem Profile
// ============================================================================

export const PIPELINE_GEM_DEFAULTS: Omit<GemProfile, 'id' | 'created' | 'modified'> = {
  name: 'Gem-xY 文案助手',
  description: '上传视频 → 提取文案 → AI 改写 → 语音合成。一站式短视频文案生产线。',
  avatar: '🎬',
  systemPrompt: PIPELINE_SYSTEM_PROMPT,
  modelId: '',
  provider: '',
  allowedTools: [],
  knowledgeFiles: [],
}

// ============================================================================
// Rewrite prompt templates
// ============================================================================

export const REWRITE_STYLES: Record<string, string> = {
  'oral': '改成更口语化、自然的风格，像朋友聊天一样',
  'professional': '改成更专业、有深度的风格，适合知识类内容',
  'humorous': '改成更幽默、轻松有趣的风格，可以适当加些段子',
  'emotional': '改成更有感染力、能打动人心的风格',
  'persuasive': '改成更有说服力的种草风格，引导观众行动',
  'concise': '精简文案，去掉冗余，保留核心信息，更加紧凑',
}

/**
 * Build the full rewrite message to send to the LLM.
 * Combines the rewrite instruction with the extracted script.
 */
export function buildRewriteMessage(extractedText: string, styleOrCustom: string): string {
  const stylePrompt = REWRITE_STYLES[styleOrCustom] ?? styleOrCustom

  return `请根据以下要求改写文案：

改写要求：${stylePrompt}

原始文案：
${extractedText}

请直接输出改写后的文案。`
}
