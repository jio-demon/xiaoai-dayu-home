import type { AudioPayload, ProviderConfig } from '@xiaoai/protocol';
import { uid } from '@xiaoai/protocol';
import type { TtsProvider } from './types';

const V1_ENDPOINT = 'https://openspeech.bytedance.com/api/v1/tts';
const V3_ENDPOINT = 'https://openspeech.bytedance.com/api/v3/tts/unidirectional';

/**
 * 火山引擎（豆包）语音合成，双通道自动适配：
 * - 新版「豆包语音」控制台（2025 起）：API Key 管理页取 X-Api-Key → v3 单向流式 HTTP，
 *   Resource-Id 填「模型」框（seed-tts-2.0 = 合成2.0 / volc.service_type.10029 = 大模型语音合成1.0）。
 *   免费额度 = 开通管理里点「试用」（2 万字符/半年），无需 APP ID。
 * - 旧版「语音技术」应用：APP ID + Access Token → v1 接口，cluster volcano_tts。
 * 判定：填了 APP ID 走 v1；只填 API Key 走 v3。baseUrl 可覆盖端点。
 */
export class VolcanoTts implements TtsProvider {
  constructor(private cfg: ProviderConfig) {}

  async synthesize(text: string, voice: string, speed: number): Promise<AudioPayload> {
    let voiceType = (voice || '').replace(/^volcano:/, '') || VOLCANO_VOICES[0].id;
    // 旧 1.0 音色 ID（moon/mars）自动迁移到 2.0（uranus），避免旧配置直接报音色不存在
    if (!this.cfg.appId) voiceType = voiceType.replace(/_moon_bigtts|_mars_bigtts/, '_uranus_bigtts');
    const rate = Math.max(-50, Math.min(100, Math.round((speed - 1) * 100)));
    if (this.cfg.appId) return this.synthV1(text, voiceType, rate);
    return this.synthV3(text, voiceType, rate);
  }

  /** 新版 v3：X-Api-Key 鉴权，HTTP chunked 流式返回多段 JSON（data 为 base64 音频块）。 */
  private async synthV3(text: string, voiceType: string, rate: number): Promise<AudioPayload> {
    const resourceId = this.cfg.model || 'seed-tts-2.0';
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 30000);
    try {
      const res = await fetch(this.cfg.baseUrl || V3_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': this.cfg.apiKey,
          'X-Api-Resource-Id': resourceId,
          'X-Api-Request-Id': uid('tts-'),
        },
        body: JSON.stringify({
          req_params: {
            text,
            speaker: voiceType,
            audio_params: { format: 'mp3', sample_rate: 24000, speech_rate: rate },
          },
        }),
        signal: ctrl.signal,
      });
      const raw = await res.text();
      if (!res.ok) throw new Error(`火山 TTS(v3) HTTP ${res.status}: ${raw.slice(0, 240)}`);
      // chunked 响应可能多行 JSON 连排；逐个解析拼接 data
      const chunks: string[] = [];
      let err = '';
      for (const line of raw.split(/\r?\n/)) {
        const s = line.trim();
        if (!s) continue;
        let j: any;
        try { j = JSON.parse(s); } catch { continue; }
        if (j.code !== undefined && j.code !== 0 && j.code !== 20000000) {
          err = `火山 TTS(v3) ${j.code}: ${j.message || ''}`;
          if (/resource id|access denied|grant/i.test(String(j.message))) {
            err += '（检查「模型」框 Resource-Id 与音色是否匹配、该模型是否已在控制台「开通管理」开通/试用）';
          }
          if (/quota exceeded/i.test(String(j.message))) err += '（试用额度用尽：需开通正式版或购买资源包）';
        }
        if (typeof j.data === 'string' && j.data) chunks.push(j.data);
      }
      if (!chunks.length) throw new Error(err || `火山 TTS(v3) 无音频返回: ${raw.slice(0, 200)}`);
      // 拼接 base64 mp3 块：解码→合并→重编码（块边界不一定对齐 4 字符组）
      const bytes: Uint8Array[] = chunks.map((c) => Uint8Array.from(atob(c), (ch) => ch.charCodeAt(0)));
      const total = bytes.reduce((n, b) => n + b.length, 0);
      const merged = new Uint8Array(total);
      let off = 0;
      for (const b of bytes) { merged.set(b, off); off += b.length; }
      let bin = '';
      for (let i = 0; i < merged.length; i += 8192) bin += String.fromCharCode(...merged.subarray(i, i + 8192));
      return { mime: 'audio/mpeg', data: btoa(bin) };
    } finally { clearTimeout(t); }
  }

  /** 旧版 v1：APP ID + Access Token（Bearer;token），cluster volcano_tts / volcano_icl。 */
  private async synthV1(text: string, voiceType: string, rate: number): Promise<AudioPayload> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 30000);
    try {
      const res = await fetch(this.cfg.baseUrl || V1_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer;${this.cfg.apiKey}` },
        body: JSON.stringify({
          app: { appid: this.cfg.appId, token: this.cfg.apiKey, cluster: this.cfg.model || 'volcano_tts' },
          user: { uid: 'xiaoai-dayu' },
          audio: { voice_type: voiceType, encoding: 'mp3', speed_ratio: 1.0, rate: 24000 },
          request: { reqid: uid('tts-'), text, operation: 'query', with_frontend: 1, frontend_type: 'unitTson', additions: JSON.stringify({ speech_rate: rate }) },
        }),
        signal: ctrl.signal,
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j) throw new Error(`火山 TTS HTTP ${res.status}: ${(JSON.stringify(j) || '').slice(0, 240)}`);
      if (j.code !== 3000 || !j.data) {
        throw new Error(`火山 TTS ${j.code}: ${j.message || ''}${j.code === 3001 ? '（音色未授权：确认该音色已领取/购买，且 cluster 正确）' : ''}`.slice(0, 260));
      }
      return { mime: 'audio/mpeg', data: j.data as string };
    } finally { clearTimeout(t); }
  }
}

/** 活泼可爱系音色（豆包语音合成 2.0，Resource-Id seed-tts-2.0；试用期内全部音色可测）。 */
export const VOLCANO_VOICES: { id: string; name: string }[] = [
  { id: 'zh_female_shuangkuaisisi_uranus_bigtts', name: '爽快思思 2.0（活泼少女·推荐）' },
  { id: 'zh_female_sajiaoxuemei_uranus_bigtts', name: '撒娇学妹 2.0（软糯撒娇）' },
  { id: 'zh_female_cancan_uranus_bigtts', name: '知性灿灿 2.0（元气甜妹）' },
  { id: 'zh_female_tianmeitaozi_uranus_bigtts', name: '甜美桃子 2.0（甜系）' },
  { id: 'zh_female_linjianvhai_uranus_bigtts', name: '邻家女孩 2.0（软萌）' },
  { id: 'zh_female_vv_uranus_bigtts', name: 'Vivi 2.0（豆包同款·多语种）' },
  { id: 'zh_female_tuanzi_uranus_bigtts', name: '团子 2.0（Q 萌）' },
  { id: 'zh_male_shaonianzixin_uranus_bigtts', name: '少年梓辛 2.0（少年感）' },
];
