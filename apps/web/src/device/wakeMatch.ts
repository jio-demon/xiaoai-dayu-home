/** 唤醒词匹配：转写文本归一化后做包含匹配，附带常见同音误识别容错。 */

/** 只保留小写字母/数字/中日韩汉字，去掉空格与标点。 */
export function normalizeTranscript(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '');
}

/** ASR 对「大肥鱼」的常见同音误写。 */
const HOMOPHONES: Record<string, string[]> = {
  '大肥鱼': [
    '大飞鱼', '大非鱼', '大菲鱼', '大肥余', '大肥于', '大肥渔',
    '大肥雨', '大肥羽', '大肥语', '大肥宇', '大肥愚', '大肥榆', '达肥鱼',
  ],
};

/** 转写文本中是否出现了唤醒词（或其同音变体）。 */
export function matchWakeWord(transcript: string, wakeWord: string): boolean {
  const t = normalizeTranscript(transcript);
  const w = normalizeTranscript(wakeWord);
  if (!t || !w) return false;
  if (t.includes(w)) return true;
  for (const v of HOMOPHONES[w] ?? []) if (t.includes(v)) return true;
  return false;
}
