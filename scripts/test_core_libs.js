const assert = require('assert');
const { normalizeToolCalls } = require('../lib/normalize.ts');
const { isVisionModel } = require('../lib/vision.ts');
const { isTtsModel, isVoiceCloneModel, isVoiceDesignModel, isBaseTtsModel, cleanSpeechText } = require('../lib/tts-utils.ts');

console.log('--- Running Pi Agent xY Core Lib Unit Tests ---');

// 1. normalize.ts Tests
console.log('\n--- 1. Testing lib/normalize.ts ---');

// Case 1.1: Non-assistant role should remain untouched
const msgUser = { role: 'user', content: 'hello' };
assert.deepStrictEqual(normalizeToolCalls(msgUser), msgUser);
console.log('✅ Case 1.1: Non-assistant role ignored');

// Case 1.2: Assistant role without array content should remain untouched
const msgText = { role: 'assistant', content: 'hello' };
assert.deepStrictEqual(normalizeToolCalls(msgText), msgText);
console.log('✅ Case 1.2: Assistant text content ignored');

// Case 1.3: Assistant with legacy toolCall block format should be normalized
const legacyBlock = {
  type: 'toolCall',
  id: 'call_123',
  name: 'run_command',
  arguments: { cmd: 'dir' }
};
const legacyMsg = {
  role: 'assistant',
  content: [legacyBlock]
};
const normalized = normalizeToolCalls(legacyMsg);
assert.deepStrictEqual(normalized.content[0], {
  type: 'toolCall',
  toolCallId: 'call_123',
  toolName: 'run_command',
  input: { cmd: 'dir' }
});
console.log('✅ Case 1.3: Legacy toolCall format normalized successfully');

// Case 1.4: Normal toolCall block format should remain untouched
const normalBlock = {
  type: 'toolCall',
  toolCallId: 'call_abc',
  toolName: 'git_status',
  input: {}
};
const normalMsg = {
  role: 'assistant',
  content: [normalBlock]
};
assert.deepStrictEqual(normalizeToolCalls(normalMsg), normalMsg);
console.log('✅ Case 1.4: Normal toolCall format preserved');


// 2. vision.ts Tests
console.log('\n--- 2. Testing lib/vision.ts ---');

// Case 2.1: Mainstream Vision Models
assert.strictEqual(isVisionModel('openai', 'gpt-4o'), true);
assert.strictEqual(isVisionModel('anthropic', 'claude-3-5-sonnet'), true);
assert.strictEqual(isVisionModel('google', 'gemini-1.5-pro'), true);
assert.strictEqual(isVisionModel('deepseek', 'deepseek-vl2'), true);
assert.strictEqual(isVisionModel('', 'qwen-vl-max'), true);
console.log('✅ Case 2.1: Mainstream Vision models correctly detected');

// Case 2.2: Non-Vision Models
assert.strictEqual(isVisionModel('openai', 'gpt-4o-mini-tts'), false); // TTS models are ignored
assert.strictEqual(isVisionModel('openai', 'o1-mini'), false); // o1-mini has no image completions API support
assert.strictEqual(isVisionModel('deepseek', 'deepseek-chat'), false); // deepseek-chat has no image input
console.log('✅ Case 2.2: Non-Vision models correctly ignored');


// 3. tts-utils.ts Tests
console.log('\n--- 3. Testing lib/tts-utils.ts ---');

// Case 3.1: Model classification
assert.strictEqual(isTtsModel('mimo-tts', 'any-model'), true);
assert.strictEqual(isTtsModel('', 'mimo-v2.5-tts'), true);
assert.strictEqual(isVoiceCloneModel('', 'mimo-v2.5-tts-voiceclone'), true);
assert.strictEqual(isVoiceDesignModel('', 'mimo-v2.5-tts-voicedesign'), true);
assert.strictEqual(isBaseTtsModel('', 'mimo-v2.5-tts'), true);
console.log('✅ Case 3.1: TTS model classification works perfectly');

// Case 3.2: cleanSpeechText (from tag injection tests)
const text1 = 'Hello, this is a clean text for synthesis.';
assert.strictEqual(cleanSpeechText(text1), text1);

const text2 = 'This is the main speech text.<!-- PI_FILE_ATTACHMENTS_START -->\n📄 [已上传文件到工作区]\n- Temp/audio.wav (1.2 MB)\n<!-- PI_FILE_ATTACHMENTS_END -->';
assert.strictEqual(cleanSpeechText(text2), 'This is the main speech text.');

const text3 = 'This is the speech text.<!-- PI_FILE_ATTACHMENTS_START -->\n📄 [已上传文件到工作区]\n- Temp/audio.wav (1.2 MB)';
assert.strictEqual(cleanSpeechText(text3), 'This is the speech text.');

const text4 = 'This is the legacy speech text.\n\n📄 [已上传文件到工作区]\n- Temp/legacy.wav (500 KB)';
assert.strictEqual(cleanSpeechText(text4), 'This is the legacy speech text.');

const text5 = 'Line 1\nLine 2\n\n<!-- PI_FILE_ATTACHMENTS_START -->\n📄 [已上传文件到工作区]\n- Temp/file.txt (10 KB)\n<!-- PI_FILE_ATTACHMENTS_END -->';
assert.strictEqual(cleanSpeechText(text5), 'Line 1\nLine 2');
console.log('✅ Case 3.2: cleanSpeechText tag boundaries and legacy regex fallback work perfectly');

console.log('\n🎉 ALL CORE LIBRARY UNIT TESTS PASSED SUCCESSFULLY! 🎉');
