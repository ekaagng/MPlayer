import { invoke, isTauri } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import type { Track } from '../types/audio';

export interface NativeRuntimeInfo {
  platform: string;
  nativeAudio: boolean;
  folderScanning: boolean;
  database: string;
}

export interface NativeTrackFile {
  id: number;
  path: string;
  title: string;
  format: string;
  sizeBytes: number;
  modifiedAt: number | null;
}

export interface NativeScanResult {
  tracks: NativeTrackFile[];
  truncated: boolean;
  scannedFolder: string;
}

export interface NativePlaybackSnapshot {
  path: string | null;
  isPlaying: boolean;
  currentTimeMs: number;
  durationMs: number;
  volume: number;
}

/** Returns null in a normal browser preview. */
export async function getNativeRuntimeInfo(): Promise<NativeRuntimeInfo | null> {
  if (!isTauri()) return null;
  return invoke<NativeRuntimeInfo>('native_runtime_info');
}

export async function listNativeTracks(): Promise<NativeTrackFile[]> {
  if (!isTauri()) return [];
  return invoke<NativeTrackFile[]>('native_list_tracks');
}

/** The folder picker is desktop-only; mobile needs SAF / Files document-picker integration. */
export async function scanNativeMusicFolder(): Promise<NativeScanResult | null> {
  if (!isTauri()) return null;

  const runtime = await getNativeRuntimeInfo();
  if (!runtime?.folderScanning) {
    throw new Error('Pemilihan folder penuh belum didukung di Android/iOS. Integrasi document picker mobile masih diperlukan.');
  }

  const selected = await open({
    title: 'Pilih folder musik',
    directory: true,
    multiple: false,
  });

  if (typeof selected !== 'string' || selected.length === 0) return null;
  return invoke<NativeScanResult>('native_scan_music_directory', { path: selected });
}

export function toAppTrack(file: NativeTrackFile, index = 0): Track {
  const extension = file.format.toUpperCase();
  const format: Track['format'] = ['DSF', 'DFF'].includes(extension)
    ? 'DSD'
    : (['FLAC', 'WAV', 'MP3', 'MQA', 'AAC', 'ALAC', 'OGG', 'OPUS', 'AIFF', 'M4A'].includes(extension)
      ? extension as Track['format']
      : 'UNKNOWN');

  return {
    id: `native-${file.id}`,
    trackNumber: String(index + 1).padStart(2, '0'),
    title: file.title,
    artist: '',
    album: '',
    format,
    sampleRate: 'Belum dibaca',
    sampleRateNum: 0,
    bitDepth: 'Belum dibaca',
    bitrate: 'Metadata belum dibaca',
    sizeMB: file.sizeBytes / (1024 * 1024),
    duration: 0,
    durationFormatted: '--:--',
    inodePath: file.path,
    year: 0,
    coverUrl: '',
  };
}
