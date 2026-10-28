export interface Track {
  id: string;
  trackNumber: string;
  title: string;
  artist: string;
  album: string;
  format: 'FLAC' | 'WAV' | 'DSD' | 'MP3' | 'MQA' | 'AAC' | 'ALAC' | 'OGG' | 'OPUS' | 'AIFF' | 'M4A' | 'UNKNOWN';
  sampleRate: string; // e.g. "192kHz", "96kHz", "5.6MHz", "44.1kHz"
  sampleRateNum: number; // e.g. 192000
  bitDepth: string; // e.g. "24-bit", "32-bit", "1-bit"
  bitrate: string; // e.g. "5,820 kbps"
  sizeMB: number; // e.g. 218.4
  duration: number; // seconds
  durationFormatted: string; // e.g. "05:24.12"
  inodePath: string;
  year: number;
  coverUrl: string;
  badge?: string; // e.g. "MQA/MASTER", "Hi-Res DSD", "PCM 24b", "192kHz RAW"
  lrcLines?: LRCLine[];
  synthesizerScore?: string; // instrument sequence tag for Web Audio synth
}

export interface Playlist {
  id: string;
  title: string;
  trackCount: number;
  /** Track IDs are unique within a playlist; counts are derived from this list. */
  trackIds?: string[];
  subtitle: string;
  isDropZone?: boolean;
}

export interface LRCLine {
  id: string;
  timeMs: number;
  timeFormatted: string; // [mm:ss.xx]
  text: string;
  isInstrumental?: boolean;
  synced: boolean;
}

export type EQFrequency = '31Hz' | '62Hz' | '125Hz' | '250Hz' | '500Hz' | '1kHz' | '2kHz' | '4kHz' | '8kHz' | '16kHz';

export interface EqualizerState {
  enabled: boolean;
  preamp: number; // in dB (-12 to +12)
  bands: Record<EQFrequency, number>; // in dB (-12 to +12)
  preset: 'flat' | 'harman' | 'audiophile' | 'bass' | 'vocal' | 'custom';
  abMode: 'A' | 'B';
  autoPreamp: boolean;
}

export interface OutputSettings {
  activeDevice: 'topping' | 'schiit' | 'realtek';
  wasapiMode: 'exclusive' | 'shared';
  bufferIndex: number; // 0=64, 1=128, 2=256, 3=512
  bufferSamples: number;
  latencyMs: number;
  gracefulFallback: boolean;
  forceResample: boolean; // false = disabled, true = 48kHz test
}

export type AppView =
  | 'library-and-tracks'
  | 'now-playing-and-signal-path'
  | 'equalizer-and-dsp'
  | 'lyrics-editor'
  | 'audio-output-settings';
