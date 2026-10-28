import { invoke, isTauri } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import type { EqualizerState, EQFrequency, Playlist, Track } from '../types/audio';

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
  artist: string;
  album: string;
  format: string;
  sizeBytes: number;
  modifiedAt: number | null;
  durationMs: number | null;
  sampleRateHz: number | null;
  bitDepth: number | null;
  bitrateBps: number | null;
}

export interface NativeScanResult {
  tracks: NativeTrackFile[];
  truncated: boolean;
  scannedFolder: string;
}

export interface NativePlaylistRecord {
  id: number;
  name: string;
  trackIds: number[];
}

export interface NativeHistoryEntry {
  track: NativeTrackFile;
  playedAt: string;
  lastPositionMs: number;
}

export interface NativeEqualizerSettings {
  enabled: boolean;
  preampDb: number;
  autoPreamp: boolean;
  bandsDb: number[];
}

export const EQ_FREQUENCY_KEYS: EQFrequency[] = [
  '31Hz', '62Hz', '125Hz', '250Hz', '500Hz',
  '1kHz', '2kHz', '4kHz', '8kHz', '16kHz',
];

export async function getNativeEqualizer(): Promise<NativeEqualizerSettings> {
  if (!isTauri()) throw new Error('Pengaturan EQ native hanya tersedia di aplikasi native.');
  return invoke<NativeEqualizerSettings>('native_get_equalizer');
}

export async function saveNativeEqualizer(settings: EqualizerState): Promise<void> {
  if (!isTauri()) return;
  await invoke<NativeEqualizerSettings>('native_set_equalizer', {
    enabled: settings.enabled,
    preampDb: settings.preamp,
    autoPreamp: settings.autoPreamp,
    bandsDb: EQ_FREQUENCY_KEYS.map((frequency) => settings.bands[frequency]),
  });
}

export interface NativePlaybackSnapshot {
  path: string | null;
  isPlaying: boolean;
  currentTimeMs: number;
  durationMs: number;
  volume: number;
}

export async function listNativeHistory(limit = 20): Promise<NativeHistoryEntry[]> {
  if (!isTauri()) return [];
  return invoke<NativeHistoryEntry[]>('native_get_recent_history', {
    limit: Math.max(1, Math.min(100, Math.floor(limit))),
  });
}

export async function listNativePlaylists(): Promise<Playlist[]> {
  if (!isTauri()) return [];
  const playlists = await invoke<NativePlaylistRecord[]>('native_list_playlists');
  return playlists.map(toAppPlaylist);
}

export async function createNativePlaylist(name: string): Promise<Playlist> {
  requireNativeRuntime();
  return toAppPlaylist(await invoke<NativePlaylistRecord>('native_create_playlist', { name }));
}

export async function renameNativePlaylist(id: string, name: string): Promise<Playlist> {
  requireNativeRuntime();
  const playlistId = parseNativePlaylistId(id);
  return toAppPlaylist(await invoke<NativePlaylistRecord>('native_rename_playlist', { playlistId, name }));
}

export async function deleteNativePlaylist(id: string): Promise<void> {
  requireNativeRuntime();
  const playlistId = parseNativePlaylistId(id);
  await invoke('native_delete_playlist', { playlistId });
}

export async function addNativeTrackToPlaylist(playlistId: string, trackId: string): Promise<Playlist> {
  requireNativeRuntime();
  const nativePlaylistId = parseNativePlaylistId(playlistId);
  const nativeTrackId = parseNativeTrackId(trackId);
  return toAppPlaylist(await invoke<NativePlaylistRecord>('native_add_track_to_playlist', {
    playlistId: nativePlaylistId,
    trackId: nativeTrackId,
  }));
}

export async function getNativeLyrics(trackId: string): Promise<string | null> {
  requireNativeRuntime();
  const nativeTrackId = parseNativeTrackId(trackId);
  return invoke<string | null>('native_get_lyrics', { trackId: nativeTrackId });
}

export async function saveNativeLyrics(trackId: string, lrcText: string): Promise<void> {
  requireNativeRuntime();
  const nativeTrackId = parseNativeTrackId(trackId);
  await invoke('native_save_lyrics', { trackId: nativeTrackId, lrcText });
}

export function toAppPlaylist(playlist: NativePlaylistRecord): Playlist {
  const trackIds = playlist.trackIds.map((id) => `native-${id}`);
  return {
    id: `native-playlist-${playlist.id}`,
    title: playlist.name,
    trackCount: trackIds.length,
    trackIds,
    subtitle: `${trackIds.length} lagu`,
    isDropZone: false,
  };
}

function requireNativeRuntime(): void {
  if (!isTauri()) throw new Error('Operasi ini hanya tersedia di aplikasi native.');
}

function parseNativePlaylistId(id: string): number {
  const match = /^native-playlist-(\d+)$/.exec(id);
  const parsed = match ? Number(match[1]) : NaN;
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error('ID playlist native tidak valid.');
  return parsed;
}

function parseNativeTrackId(id: string): number {
  const match = /^native-(\d+)$/.exec(id);
  const parsed = match ? Number(match[1]) : NaN;
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error('ID track native tidak valid.');
  return parsed;
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

  const durationMs = Math.max(0, file.durationMs ?? 0);
  const sampleRateHz = Math.max(0, file.sampleRateHz ?? 0);
  const bitDepth = file.bitDepth ?? 0;
  const bitrateBps = Math.max(0, file.bitrateBps ?? 0);
  const sampleRate = sampleRateHz >= 1_000_000
    ? `${(sampleRateHz / 1_000_000).toFixed(1).replace(/\.0$/, '')}MHz`
    : sampleRateHz > 0
      ? `${(sampleRateHz / 1000).toFixed(sampleRateHz % 1000 === 0 ? 0 : 1)}kHz`
      : 'Metadata belum dibaca';
  const totalSeconds = Math.floor(durationMs / 1000);
  const durationFormatted = durationMs > 0
    ? `${String(Math.floor(totalSeconds / 60)).padStart(2, '0')}:${String(totalSeconds % 60).padStart(2, '0')}.${String(Math.floor((durationMs % 1000) / 10)).padStart(2, '0')}`
    : '--:--';

  return {
    id: `native-${file.id}`,
    trackNumber: String(index + 1).padStart(2, '0'),
    title: file.title,
    artist: file.artist?.trim() ?? '',
    album: file.album?.trim() ?? '',
    format,
    sampleRate,
    sampleRateNum: sampleRateHz,
    bitDepth: bitDepth > 0 ? `${bitDepth}-bit` : 'Metadata belum dibaca',
    bitrate: bitrateBps > 0 ? `${Math.round(bitrateBps / 1000).toLocaleString('en-US')} kbps` : 'Metadata belum dibaca',
    sizeMB: file.sizeBytes / (1024 * 1024),
    duration: durationMs / 1000,
    durationFormatted,
    inodePath: file.path,
    year: 0,
    coverUrl: '',
  };
}
