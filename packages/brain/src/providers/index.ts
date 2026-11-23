import type { AppConfig } from '@xiaoai/protocol';
import { DeepSeekChat } from './deepseek';
import { DashScopeAsr, DashScopeChat, DashScopeEmbed, DashScopeTts } from './dashscope';
import { SiliconFlowAsr, SiliconFlowEmbed, SiliconFlowTts } from './siliconflow';
import { VolcanoTts } from './volcano';
import type { Providers } from './types';

export function createProviders(cfg: AppConfig): Providers {
  const chat = cfg.llm.id === 'dashscope' ? new DashScopeChat(cfg.llm) : new DeepSeekChat(cfg.llm);
  const asr = cfg.asr.id === 'dashscope' ? new DashScopeAsr(cfg.asr) : new SiliconFlowAsr(cfg.asr);
  const tts = cfg.tts.id === 'volcano' ? new VolcanoTts(cfg.tts)
    : cfg.tts.id === 'dashscope' ? new DashScopeTts(cfg.tts) : new SiliconFlowTts(cfg.tts);
  const embed = cfg.embedding.id === 'dashscope' ? new DashScopeEmbed(cfg.embedding) : new SiliconFlowEmbed(cfg.embedding);
  return { chat, asr, tts, embed };
}

export * from './types';
export * from './test';
export { VOLCANO_VOICES } from './volcano';

