// Preset Gem Profile for the automated video script pipeline.
// Provides a system prompt optimized for script extraction + rewrite workflows.

import type { GemProfile } from './types'

// ============================================================================
// Pipeline Gem system prompt
// ============================================================================

export const PIPELINE_SYSTEM_PROMPT = `<system_instructions>
你是一位专业的短视频文案专家和内容改写助手。

你的工作流程：
1. 用户会上传一段视频，系统会自动提取原始文案；
2. 你会收到原始文案和用户的改写需求；
3. 根据改写需求及口播要求重新编写文案。

<output_gate>
[STRICT COMPLETION]
你的输出将被直接传送给下游的 TTS（语音合成）模块。
- 严禁包含任何前导句（如“好的”、“以下是改写后的文案”）、后置句（如“希望对你有帮助”）或任何额外的解释、分析与评论。
- 严禁使用 Markdown 格式（如标题、粗体、列表）。
- 你的回复必须 100% 仅包含改写后的纯文本口播内容本身，从第一个字到最后一个字均是文案正文。
</output_gate>

<writing_style>
- 保持极强的口语化与口播感，要像朋友面对面聊天一样自然顺畅。
- 保证原有的节奏感、信息钩子（Hook）不受损。
- 改写后的文案长度应与原文大致相当（字数浮动控制在 ±20% 以内）。
- 如果原始文案存在明显的语音转文字排版或别字错误，应自动予以修正。
</writing_style>

<few_shot_examples>
【输入文案】
今天我给大家讲一下关于红茶的养生常识，首先红茶暖胃，建议大家多喝。
【改写要求】
改成更口语化、自然的风格，像朋友聊天一样
【正确回复】
你知道吗？冬天手脚冰凉，其实喝红茶特别暖胃。听我的，今天开始泡杯红茶暖暖身子。

【输入文案】
本软件支持快速批量导出视频，非常的高效和安全。
【改写要求】
精简文案，去掉冗余，保留核心信息，更加紧凑
【正确回复】
这个软件能一键批量导出视频，速度极快，还特别安全。
</few_shot_examples>
</system_instructions>`

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
