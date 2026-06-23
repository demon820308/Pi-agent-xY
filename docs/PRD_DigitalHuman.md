# PRD: Pi Agent xY 数字人功能

> **版本**: v1.0
> **日期**: 2026-06-09
> **作者**: Pi Agent xY Team
> **状态**: Draft

---

## 1. 概述

### 1.1 背景

Pi Agent xY 是一个功能完善的 AI 编程智能体 Web UI，已具备多模型 LLM 对话、MiMo v2.5 TTS 语音合成、会话树管理等能力。为进一步提升用户体验和产品差异化竞争力，计划集成数字人功能，为 AI 助手赋予视觉形象和语音交互能力。

### 1.2 产品愿景

将 Pi Agent xY 从「文字聊天 + 语音播报」升级为「看得见、听得到、能说话」的 AI 数字人交互平台，打造沉浸式极客编码工作台。

### 1.3 目标用户

| 用户群 | 需求 |
|--------|------|
| AI 编程开发者 | 与 AI 助手自然对话，解放双手 |
| 提示词工程师 | 通过语音快速迭代 prompt |
| 技术内容创作者 | 录制带数字人的技术视频 |
| 团队协作场景 | 共享数字人进行技术讨论 |

---

## 2. 功能需求

### 2.1 核心功能（P0）

#### F1: Avatar 视觉渲染

**描述**: 在聊天区域显示 AI 助手的 3D 头像，支持表情和口型动画。

**支持风格**:
- 二次元/动漫风格（VRM 模型，VRoid Studio 制作）
- 写实/半写实风格（GLB 模型，Ready Player Me 等来源）
- 用户可在设置中切换

**技术要求**:
- 使用 Three.js + @pixiv/three-vrm 渲染 VRM 模型
- 支持 SpringBone 物理（头发、衣服自然飘动）
- 自动眨眼（随机间隔 2-6 秒）
- 支持全屏和角落悬浮两种显示模式
- 模型加载显示进度条

**验收标准**:
- [ ] Avatar 渲染流畅（≥30fps）
- [ ] 自动眨眼自然
- [ ] 风格切换后模型正确加载
- [ ] 不影响现有 UI 性能

#### F2: 唇形同步

**描述**: TTS 语音播放时，Avatar 的嘴巴跟随发音内容同步动。

**实现阶段**:
- Phase 1: 音量映射（Web Audio AnalyserNode → 嘴巴张开度 0~1）
- Phase 2: Rhubarb WASM 精确唇形（Preston Blair 口型 A-H, X）
- Phase 3: HeadTTS viseme 直出（15 种标准 viseme）

**技术要求**:
- 延迟 < 50ms（实时感）
- 与现有 MiMo TTS 和新增 HeadTTS 均兼容
- 静音时嘴巴自动闭合

**验收标准**:
- [ ] TTS 播放时嘴巴明显跟着动
- [ ] 无明显延迟感
- [ ] 播放结束后嘴巴自然闭合

#### F3: 表情驱动

**描述**: 根据 LLM 回复内容自动切换 Avatar 表情。

**情感类别**:

| 情感 | 触发条件 | VRM Expression |
|------|---------|----------------|
| happy | 积极评价、成功确认、感叹句 | happy |
| sad | 错误、抱歉、失败 | sad |
| thinking | 问句、省略号、"让我想想" | neutral + 眉毛微皱 |
| surprised | 惊叹词、意外结果 | surprised |
| angry | 严重错误、警告 | angry |
| speaking | 流式输出中 | 口型驱动，保持中性表情 |
| neutral | 默认状态 | neutral |
| idle | 无对话时 | neutral + 随机眨眼 |

**技术要求**:
- Phase 1: 关键词+正则规则引擎（零依赖，<1ms）
- Phase 2: 可选升级到 Transformers.js 情感分类器（~80MB 模型）
- 表情过渡平滑（贝塞尔曲线，300ms 过渡时间）

**验收标准**:
- [ ] LLM 说"太好了！"时 Avatar 笑
- [ ] LLM 说"抱歉，出错了"时 Avatar 难过
- [ ] 流式输出中 Avatar 嘴巴在动
- [ ] 表情切换无突变

#### F4: 混合输入（文字 + 语音）

**描述**: 用户可以通过打字或说话两种方式与 AI 对话。

**语音输入流程**:
1. 用户点击麦克风按钮（或按住 PTT）
2. 浏览器请求麦克风权限
3. 录音中显示脉冲动画反馈
4. 松开后自动转写为文字
5. 转写结果填入输入框（用户可编辑）
6. 发送给 LLM

**技术要求**:
- Phase 1: Web Speech API（零模型下载，Chrome 即用）
- Phase 2: Transformers.js Whisper WASM（全浏览器兼容）
- 支持中英文自动识别
- 录音最长 60 秒

**验收标准**:
- [ ] 说话后文字正确出现在输入框
- [ ] 中英文识别基本准确
- [ ] 嘈杂环境下有合理的降噪

### 2.2 重要功能（P1）

#### F5: 双 TTS 引擎

**描述**: 支持 MiMo v2.5 TTS 和 HeadTTS（Kokoro）两种 TTS 引擎。

**MiMo TTS**（现有）:
- 保留所有现有功能：声线设计、声音克隆、情感标签
- 唇形用 Rhubarb WASM 或音量映射
- 需要 API Key（云端服务）

**HeadTTS**（新增）:
- 基于 Kokoro 神经 TTS 模型
- 纯浏览器运行（WebGPU/WASM）
- 自带 15 种 viseme 数据（无需额外唇形分析）
- 免费，无需 API Key
- 模型首次下载 ~100MB，后续浏览器缓存

**用户选择**:
- 在 TTS 面板中添加引擎切换开关
- 选择 HeadTTS 时自动使用其 viseme 驱动唇形
- 选择 MiMo 时保持现有逻辑 + 音量映射/Rhubarb

**验收标准**:
- [ ] 两个引擎均可正常合成语音
- [ ] HeadTTS viseme 驱动唇形精确
- [ ] 切换引擎后唇形自动适配

#### F6: 数字人控制面板

**描述**: 新增独立面板管理数字人相关设置。

**面板内容**:
- Avatar 模型选择（预置 + 自定义上传）
- 风格切换（二次元 / 写实）
- 显示模式（角落悬浮 / 全屏）
- TTS 引擎选择（MiMo / HeadTTS）
- 唇形模式选择（音量 / Rhubarb / Viseme）
- 麦克风设备选择

**验收标准**:
- [ ] 所有设置即时生效
- [ ] 设置持久化到 localStorage

### 2.3 可选功能（P2）

#### F7: 摄像头面部追踪

**描述**: 用户摄像头 → 面部特征点 → 驱动 Avatar 表情（镜像模式）。

**技术方案**:
- MediaPipe Face Mesh（468 个特征点）
- Kalidokit（特征点 → VRM 骨骼映射）

#### F8: Avatar 模型市场

**描述**: 内置 Avatar 模型选择，支持社区共享。

---

## 3. 非功能需求

### 3.1 性能

| 指标 | 目标 |
|------|------|
| Avatar 渲染帧率 | ≥30fps（桌面），≥20fps（移动） |
| 唇形同步延迟 | <50ms |
| STT 转写延迟 | <3秒（10秒音频） |
| 情感分析延迟 | <1ms（规则引擎） |
| Three.js 首次加载 | <2MB（代码分割后） |
| VRM 模型加载 | <3秒（压缩后 ~2-5MB） |
| 内存增量 | <200MB（含 Avatar + STT 模型） |

### 3.2 兼容性

| 浏览器 | 最低版本 | 说明 |
|--------|---------|------|
| Chrome | 90+ | 全功能支持（含 WebGPU） |
| Firefox | 90+ | WebGL 渲染，WASM STT |
| Safari | 15+ | WebGL 渲染，Web Speech STT |
| Edge | 90+ | 同 Chrome |

### 3.3 许可证合规

所有新增依赖必须为 MIT 或 Apache 2.0 许可证，确保商用无法律风险。

| 依赖 | 许可证 | 状态 |
|------|--------|------|
| three | MIT | ✅ |
| @pixiv/three-vrm | MIT | ✅ |
| @react-three/fiber | MIT | ✅ |
| @react-three/drei | MIT | ✅ |
| @huggingface/transformers | Apache 2.0 | ✅ |
| lip-sync-engine | MIT | ✅ |
| @met4citizen/talkinghead | MIT | ✅ |
| @met4citizen/headtts | MIT | ✅ |

---

## 4. 技术架构

### 4.1 组件架构

```
AppShell (根组件)
├── [现有] SessionSidebar
├── [现有] ChatWindow
│   ├── [现有] MessageView
│   ├── [新增] AvatarCanvas ← 3D Avatar 渲染
│   │   ├── VRM 模型加载
│   │   ├── 表情驱动
│   │   ├── 口型驱动
│   │   ├── 自动眨眼
│   │   └── SpringBone 物理
│   ├── [现有] ChatInput
│   │   └── [新增] VoiceInputButton ← 语音输入
│   └── [现有] TtsPanel
│       └── [新增] TTS 引擎选择
├── [新增] DigitalHumanPanel ← 数字人设置面板
├── [新增] AvatarController ← Avatar 控制逻辑
└── [新增] AvatarModelPicker ← 模型选择器
```

### 4.2 Hook 架构

```
useDigitalHuman (控制中枢)
├── useEmotion (情感分析)
├── useViseme (唇形同步)
├── useSTT (语音识别)
├── useAvatarAnimation (动画控制)
└── useTts (现有，扩展支持 HeadTTS)
```

### 4.3 数据流

```
用户输入（文字/语音）
  ↓
LLM 对话（现有 useAgentSession）
  ↓
回复文本流
  ├──→ useEmotion → AvatarCanvas (表情)
  └──→ TTS 引擎 (MiMo/HeadTTS)
       ├──→ 音频播放
       └──→ useViseme → AvatarCanvas (口型)
```

### 4.4 依赖关系图

```
@pixiv/three-vrm
  └── three (peer dependency)

@react-three/fiber
  ├── three (peer dependency)
  └── react (peer dependency)

@react-three/drei
  ├── @react-three/fiber (peer dependency)
  └── three (peer dependency)

lip-sync-engine
  └── 无外部依赖（WASM 自包含）

@huggingface/transformers
  └── onnxruntime-web (自动安装)

@met4citizen/talkinghead
  └── three (peer dependency)

@met4citizen/headtts
  └── onnxruntime-web (自动安装)
```

---

## 5. 实施计划

### Phase 1: 基础骨架（MVP）— 1-2 周

| 任务 | 估时 | 依赖 |
|------|------|------|
| 安装依赖 + 项目配置 | 0.5天 | 无 |
| 类型定义 (digital-human-types.ts) | 0.5天 | 无 |
| 情感分析引擎 (emotion-analyzer.ts) | 1天 | 无 |
| 唇形引擎 - 音量映射 (viseme-engine.ts) | 1天 | 无 |
| Avatar 渲染画布 (AvatarCanvas.tsx) | 2天 | 依赖安装 |
| 数字人控制中枢 (useDigitalHuman.ts) | 1.5天 | 上述全部 |
| 集成到 AppShell | 1天 | AvatarCanvas |
| 默认 Avatar 模型准备 | 0.5天 | 无 |
| 测试 + Bug 修复 | 1天 | 上述全部 |
| **小计** | **~9天** | |

### Phase 2: 语音输入 — 1-2 周

| 任务 | 估时 | 依赖 |
|------|------|------|
| STT 引擎 - Web Speech API | 1天 | 无 |
| STT 引擎 - Whisper WASM | 2天 | transformers.js |
| 语音输入 Hook (useSTT.ts) | 1天 | STT 引擎 |
| 语音输入按钮 (VoiceInputButton.tsx) | 1天 | useSTT |
| 集成到 ChatInput | 0.5天 | VoiceInputButton |
| 测试 + Bug 修复 | 1天 | 上述全部 |
| **小计** | **~6.5天** | |

### Phase 3: 精确唇形 + 双 TTS — 2-3 周

| 任务 | 估时 | 依赖 |
|------|------|------|
| Rhubarb WASM 集成 | 2天 | lip-sync-engine |
| HeadTTS 集成 | 2天 | @met4citizen/headtts |
| TTS 引擎适配层 | 1.5天 | 上述两个 |
| 唇形引擎升级 | 1.5天 | Rhubarb + HeadTTS |
| TTS 引擎选择器 UI | 1天 | 适配层 |
| 测试 + Bug 修复 | 1.5天 | 上述全部 |
| **小计** | **~9.5天** | |

### Phase 4: 高级特性 — 2-4 周

| 任务 | 估时 | 依赖 |
|------|------|------|
| 摄像头面部追踪 | 3天 | MediaPipe + Kalidokit |
| 写实风格 GLB 支持 | 2天 | 无 |
| 高级动画（手势/身体语言） | 3天 | AvatarCanvas |
| Avatar 模型管理 UI | 2天 | 无 |
| 测试 + Bug 修复 | 2天 | 上述全部 |
| **小计** | **~12天** | |

---

## 6. 文件清单

### 新增文件

| 文件 | 行数(估) | 说明 |
|------|---------|------|
| `lib/digital-human-types.ts` | ~50 | 类型定义 |
| `lib/emotion-analyzer.ts` | ~100 | 情感分析引擎 |
| `lib/viseme-engine.ts` | ~100 | 唇形同步引擎 |
| `lib/stt-engine.ts` | ~120 | STT 引擎封装 |
| `lib/avatar-config.ts` | ~60 | Avatar 配置管理 |
| `hooks/useDigitalHuman.ts` | ~200 | 数字人控制中枢 |
| `hooks/useSTT.ts` | ~150 | 语音识别 hook |
| `hooks/useViseme.ts` | ~120 | 唇形同步 hook |
| `hooks/useEmotion.ts` | ~80 | 情感分析 hook |
| `hooks/useAvatarAnimation.ts` | ~150 | Avatar 动画控制 |
| `components/AvatarCanvas.tsx` | ~200 | 3D Avatar 渲染 |
| `components/AvatarController.tsx` | ~150 | Avatar 控制面板 |
| `components/VoiceInputButton.tsx` | ~100 | 语音输入按钮 |
| `components/DigitalHumanPanel.tsx` | ~200 | 数字人设置面板 |
| `components/AvatarModelPicker.tsx` | ~100 | 模型选择器 |
| `app/api/avatar-models/route.ts` | ~40 | 模型列表 API |
| **合计** | **~1920** | |

### 修改文件

| 文件 | 修改内容 |
|------|---------|
| `components/AppShell.tsx` | 新增数字人模式状态 + AvatarCanvas 渲染 |
| `components/ChatWindow.tsx` | 透传消息流给 useDigitalHuman |
| `components/ChatInput.tsx` | 新增 VoiceInputButton |
| `components/TtsPanel.tsx` | 新增 TTS 引擎选择器 |
| `package.json` | 新增依赖 |

---

## 7. 风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| Three.js 包体积过大 | 高 | 首屏加载慢 | 动态 import，按需加载 |
| VRM 模型文件大 | 中 | 首次加载慢 | GLTF 压缩 + 进度条 |
| WebGPU 兼容性差 | 中 | 部分浏览器降级 | 自动降级 WebGL |
| STT 识别率低 | 中 | 语音输入体验差 | 提供编辑机会 + 多模型选择 |
| 与现有 TTS 冲突 | 低 | 音频重叠 | 复用全局单例音频注册表 |
| WASM 内存占用高 | 低 | 移动端卡顿 | 模型按需加载+卸载 |

---

## 8. 成功指标

| 指标 | 目标 | 衡量方式 |
|------|------|---------|
| Avatar 渲染帧率 | ≥30fps | Chrome DevTools Performance |
| 唇形同步延迟 | <50ms | 手动体感 + 录屏分析 |
| STT 转写准确率 | >90%（中文） | 标准测试集评估 |
| 情感分类准确率 | >80% | 人工评估 100 条样本 |
| 用户满意度 | >4/5 | 用户调研 |
| 现有功能回归 | 0 回归 | 自动化测试 + 手动回归 |

---

## 9. 附录

### 9.1 竞品参考

| 产品 | 数字人 | TTS | STT | 开源 |
|------|--------|-----|-----|------|
| ChatGPT Voice | ❌ | ✅ | ✅ | ❌ |
| Character.AI | ❌ | ✅ | ❌ | ❌ |
| D-ID | ✅ | ✅ | ❌ | ❌ |
| HeyGen | ✅ | ✅ | ❌ | ❌ |
| Inworld AI | ✅ | ✅ | ✅ | ❌ |
| **Pi Agent xY（目标）** | ✅ | ✅ | ✅ | ✅ |

### 9.2 开源依赖许可证一览

| 依赖 | 许可证 | 商用 | 修改 | 分发 |
|------|--------|------|------|------|
| three | MIT | ✅ | ✅ | ✅ |
| @pixiv/three-vrm | MIT | ✅ | ✅ | ✅ |
| @react-three/fiber | MIT | ✅ | ✅ | ✅ |
| @react-three/drei | MIT | ✅ | ✅ | ✅ |
| @huggingface/transformers | Apache 2.0 | ✅ | ✅ | ✅ |
| lip-sync-engine | MIT | ✅ | ✅ | ✅ |
| @met4citizen/talkinghead | MIT | ✅ | ✅ | ✅ |
| @met4citizen/headtts | MIT | ✅ | ✅ | ✅ |
| VRM 模型 (VRoid) | 用户自定 | ✅ | ✅ | ✅ |
