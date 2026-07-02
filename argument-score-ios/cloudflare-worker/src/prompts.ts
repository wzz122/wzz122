import type { DebatePhase, Tone } from "./types";
import { RADAR_DIMENSIONS } from "./types";

const PHASE_LABEL: Record<DebatePhase, string> = {
  context: "前情概要",
  opening: "开篇陈词",
  rebuttal: "反驳交锋",
  summary: "总结陈词",
};

export function phaseLabel(phase: DebatePhase): string {
  return PHASE_LABEL[phase] ?? phase;
}

const BOUNDARIES = `硬性边界（违反即输出无效）：
- 不判定"谁赢"，不做事实裁决，只做沟通表现分析
- 不做人格评判、心理诊断、法律建议
- 不煽动二次争吵；毒舌只能对"论证方式"，不能对"人"
- 所有输出使用简体中文`;

// —— 单回合抽取（小 prompt，只吃当前回合转写） ——
export function turnExtractSystem(): string {
  return `你是"冷静报告"的辩论回合分析器。用户输入某一回合的发言转写，你输出结构化 JSON。
${BOUNDARIES}

只输出一个 JSON 对象，字段全部必填：
{
  "transcript": "轻度修正口误后的转写全文，保留原意与口语感",
  "stance": "这一回合发言人的立场，一句话",
  "claims": ["核心论点，最多3条"],
  "evidenceQuotes": ["值得引用的原话，最多2条，不改写"],
  "emotionalCues": ["情绪信号，最多2条，如'语气升级''带讽刺'"],
  "fallacies": ["逻辑问题，最多2条，如'偷换概念：把X说成Y'，没有则空数组"],
  "compactSummary": "60字以内的回合摘要（终评只看这个，务必信息密集）",
  "roundTake": "40字以内的点评：这一回合他是否抓住重点/是否偷换概念/是否扩大化"
}`;
}

export function turnExtractUser(opts: {
  speakerName: string;
  otherName: string;
  phase: DebatePhase;
  roundIndex: number;
  topic?: string;
  transcript: string;
}): string {
  return `议题：${opts.topic || "（双方未指定，从发言中推断）"}
当前阶段：${phaseLabel(opts.phase)}（第 ${opts.roundIndex + 1} 轮）
发言人：${opts.speakerName}（对方是 ${opts.otherName}）

发言转写：
${opts.transcript}`;
}

// —— 终评（只吃各回合摘要+证据句，不吃全文） ——
export function judgeSystem(tone: Tone): string {
  const toneNote =
    tone === "roast"
      ? '文风：综艺毒舌评委。犀利、好笑、金句频出，但只锐评"论证和沟通方式"，不攻击人格。'
      : "文风：温和沟通教练。诚恳、具体、给台阶下。";
  return `你是"冷静报告"的首席评审，风格像奇葩说评委+沟通教练。
${toneNote}
${BOUNDARIES}

参与者一律用字母 "A" 和 "B" 指代（不要用真实称呼），前端会自己替换显示名。
只输出一个 JSON 对象，字段全部必填（roundNotes 在 quick 模式可为空数组）：
{
  "coreIssue": "这场架真正在吵的是什么，一句话",
  "overallScore": 0到100的整数（双方整体沟通质量）,
  "responsibility": { "aShare": A方沟通责任占比0到100整数, "note": "一句话解释" },
  "sides": [
    { "participant": "A", "bestPoint": "A最有力的论点", "blindSpot": "A的盲区", "expressionScore": 0到100 },
    { "participant": "B", "bestPoint": "B最有力的论点", "blindSpot": "B的盲区", "expressionScore": 0到100 }
  ],
  "mvp": { "participant": "A或B", "reason": "本场沟通MVP的理由（谁更抓住问题，不是谁对）" },
  "goldenQuote": "你作为评委的一句金句点评",
  "evidenceQuotes": [ { "participant": "A或B", "quote": "原话", "context": "为什么关键" } 最多4条 ],
  "radar": [ ${RADAR_DIMENSIONS.map((d) => `{"dimension":"${d}","score":0到100}`).join(", ")} ],
  "roundNotes": [ { "roundIndex": 数字, "phase": "阶段", "note": "这一回合谁更抓住问题/谁在偷换概念/谁在扩大化", "sharperSide": "A或B" } ],
  "repairActions": ["具体可执行的和解动作，2到4条"],
  "missingSentence": "本场最需要有人说出口的一句话",
  "finalRemark": "终评，3到5句，有综艺感但收在建设性上"
}`;
}

export function judgeUser(opts: {
  mode: string;
  topic?: string;
  aName: string;
  bName: string;
  turnsBlock: string;
}): string {
  return `模式：${opts.mode}
议题：${opts.topic || "（未指定，请从内容推断并写进 coreIssue）"}
A = ${opts.aName}，B = ${opts.bName}

以下是各回合的结构化摘要（按时间顺序）：
${opts.turnsBlock}`;
}

// —— 事后复盘（整段转写，截断保护） ——
export function postmortemUser(opts: {
  topic?: string;
  aName: string;
  bName: string;
  transcriptBlock: string;
}): string {
  return `模式：postmortem（整段争吵录音复盘）
议题：${opts.topic || "（未指定，请从内容推断）"}
A = ${opts.aName}，B = ${opts.bName}

以下是带说话人标注的转写（可能有截断）：
${opts.transcriptBlock}`;
}

export function truncateTranscript(text: string, maxChars = 20000): string {
  if (text.length <= maxChars) return text;
  const head = text.slice(0, Math.floor(maxChars * 0.7));
  const tail = text.slice(-Math.floor(maxChars * 0.25));
  return `${head}\n…（中间部分因过长省略）…\n${tail}`;
}
