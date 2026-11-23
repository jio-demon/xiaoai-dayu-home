import type { AppConfig, AudioPayload } from '@xiaoai/protocol';

export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string }

export interface ChatProvider { stream(messages: ChatMessage[], opts?: { temperature?: number }): AsyncIterable<string> }
export interface AsrProvider { transcribe(pcm16kBase64: string): Promise<string> }
export interface TtsProvider { synthesize(text: string, voice: string, speed: number): Promise<AudioPayload> }
export interface EmbedProvider { embed(texts: string[]): Promise<number[][]> }

export interface Providers { chat: ChatProvider; asr: AsrProvider; tts: TtsProvider; embed: EmbedProvider }

export function hasKey(cfg: { apiKey: string }): boolean { return !!cfg.apiKey && !cfg.apiKey.includes('****'); }

export type { AppConfig };
