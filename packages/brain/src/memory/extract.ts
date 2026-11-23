import { PALACE_ROOMS, clamp01, uid, type MemoryCard, type MemoryType, type PalaceRoom, type Session } from '@xiaoai/protocol';
import type { ChatMessage, ChatProvider, EmbedProvider } from '../providers/types';

export interface MemoryDraft { room: PalaceRoom; type: MemoryType; text: string; importance: number }
export interface ExtractionResult { summary: string; cards: MemoryDraft[] }

const ROOM_IDS = new Set<string>(PALACE_ROOMS.map((r) => r.id));
const TYPES = new Set<string>(['fact', 'preference', 'event', 'promise', 'emotion']);
const TYPE_ROOM: Record<MemoryType, PalaceRoom> = { fact: 'hall', preference: 'study', event: 'living', promise: 'kitchen', emotion: 'bedroom' };
const MAX_CARDS = 12;

/** 会话结束时的单次 LLM 整理调用：摘要 + 原子记忆卡片（严格 JSON）。 */
export function buildExtractMessages(session: Session): ChatMessage[] {
  const transcript = session.turns.map((t) => `${t.role === 'user' ? '用户' : '大肥鱼'}：${t.text}`).join('\n');
  const system = [
    '你是记忆提取器。阅读对话，输出严格 JSON（不要 markdown、不要解释）：',
    '{"summary":"对话中文摘要，80字以内","cards":[{"room":"hall|study|living|kitchen|bedroom","type":"fact|preference|event|promise|emotion","text":"一条原子记忆，40字以内，第三人称描述用户","importance":0到1小数}]}',
    '房间含义：hall=日常琐事, study=兴趣与知识, living=重要事件与关系, kitchen=约定与承诺, bedroom=情绪与私密。',
    '只提取关于用户的长期有用信息；寒暄、即时指令不提取。最多 8 条，没有则 cards 为空数组。',
  ].join('\n');
  return [{ role: 'system', content: system }, { role: 'user', content: transcript.slice(0, 6000) }];
}

function fallbackSummary(session: Session): string {
  return session.turns.filter((t) => t.role === 'user').map((t) => t.text).join('；').slice(0, 80);
}

/**  robust 解析：剥代码围栏、截取首尾大括号、逐条校验钳制去重。 */
export function parseExtraction(raw: string, session: Session): ExtractionResult {
  const fallback: ExtractionResult = { summary: fallbackSummary(session), cards: [] };
  try {
    let s = raw.trim().replace(/```(?:json)?/gi, '').trim();
    const a = s.indexOf('{'); const b = s.lastIndexOf('}');
    if (a < 0 || b <= a) return fallback;
    const j = JSON.parse(s.slice(a, b + 1));
    const summary = typeof j.summary === 'string' && j.summary.trim() ? j.summary.trim().slice(0, 200) : fallback.summary;
    const seen = new Set<string>();
    const cards: MemoryDraft[] = [];
    for (const c of Array.isArray(j.cards) ? j.cards : []) {
      const text = typeof c?.text === 'string' ? c.text.trim().slice(0, 120) : '';
      if (!text) continue;
      const key = text.replace(/\s+/g, '');
      if (seen.has(key)) continue;
      seen.add(key);
      const type: MemoryType = TYPES.has(c.type) ? c.type : 'fact';
      const room: PalaceRoom = ROOM_IDS.has(c.room) && c.room !== 'attic' ? c.room : TYPE_ROOM[type];
      const importance = clamp01(typeof c.importance === 'number' && isFinite(c.importance) ? c.importance : 0.5);
      cards.push({ room, type, text, importance });
      if (cards.length >= MAX_CARDS) break;
    }
    return { summary, cards };
  } catch { return fallback; }
}

export async function extractMemories(session: Session, chat: ChatProvider): Promise<ExtractionResult> {
  try {
    let raw = '';
    for await (const d of chat.stream(buildExtractMessages(session), { temperature: 0.2 })) raw += d;
    return parseExtraction(raw, session);
  } catch { return { summary: fallbackSummary(session), cards: [] }; }
}

export function draftsToCards(drafts: MemoryDraft[], sessionId: string, now: number): MemoryCard[] {
  return drafts.map((d) => ({
    id: uid('mem_'), room: d.room, type: d.type, text: d.text,
    importance: d.importance, strength: d.importance,
    createdAt: now, lastRecalledAt: null, recallCount: 0,
    pinned: false, sourceSessionIds: [sessionId],
  }));
}

/** 为缺少向量的卡片补 embedding；失败静默（无向量时召回退化为重要度排序）。 */
export async function embedCards(cards: MemoryCard[], embed: EmbedProvider): Promise<void> {
  const missing = cards.filter((c) => !c.embedding || !c.embedding.length);
  if (!missing.length) return;
  const vecs = await embed.embed(missing.map((c) => c.text));
  missing.forEach((c, i) => { if (vecs[i]) c.embedding = vecs[i]; });
}
