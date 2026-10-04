// Isolated test-only bootstrap. No production option can enable this backend.
import { getBackend } from '../../backends.js';
const backend = getBackend('qwen')!;
backend.command = process.execPath;
backend.buildArgs = (prompt) => {
  const name = prompt.match(/你是 (.+?)，岗位/)?.[1] || '成员';
  const result = name === '王欣' && prompt.includes('请委派设计师') ? '@许琳: 提出一套清晰的配色建议' : `${name}：已收到你的消息。这是隔离验收环境的测试回复。${prompt.includes('SKILL_MARKER') ? '技能已读取。' : ''}${prompt.includes('KNOWLEDGE_MARKER') ? '知识资料已读取。' : ''}`;
  return ['-e', `setTimeout(() => console.log(${JSON.stringify(result)}), 150)`];
};
await import('../../index.js');
