import React, { useState } from 'react';
import { Track } from '../types/audio';
import { AudioTelemetry } from '../services/audioEngine';
import { formatTimecodeCentiseconds } from '../utils/audioMath';

interface NowPlayingViewProps {
  currentTrack: Track | null;
  isPlaying: boolean;
  telemetry: AudioTelemetry;
  isBitPerfect: boolean;
  onTogglePlay: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onSeek?: (ms: number) => void;
}

export const NowPlayingView: React.FC<NowPlayingViewProps> = ({
  currentTrack,
  isPlaying,
  telemetry,
  isBitPerfect,
  onTogglePlay,
  onPrev,
  onNext,
  onSeek,
}) => {
  const [showSignalInspector, setShowSignalInspector] = useState(false);
  const [forceResample, setForceResample] = useState(false);
  const [isSharedMode, setIsSharedMode] = useState(false);

  const track = currentTrack || {
    id: 'track-02',
    trackNumber: '02',
    title: 'So What (Studio Master Take)',
    artist: 'Miles Davis',
    album: 'Kind of Blue (1959 Columbia Master)',
    format: 'DSD',
    sampleRate: '192kHz',
    sampleRateNum: 192000,
    bitDepth: '24-bit',
    bitrate: '5,611 kbps VBR',
    sizeMB: 394.0,
    duration: 562.04,
    durationFormatted: '09:22.04',
    inodePath: 'D:\\Lossless\\Jazz\\Miles_Davis_Kind_Of_Blue_1959_Track01_SoWhat.flac',
    year: 1959,
    coverUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=800&q=80',
    badge: 'Hi-Res DSD',
  };

  const totalDurationMs = track.duration * 1000;
  const progressPercent = totalDurationMs > 0 ? (telemetry.currentTimeMs / totalDurationMs) * 100 : 0;

  // Convert telemetry dBFS to percentage for VU meters (-48dB to 0dB)
  const leftPercent = isPlaying
    ? Math.max(12, Math.min(95, ((telemetry.rmsLeft + 48) / 48) * 100))
    : 12;
  const rightPercent = isPlaying
    ? Math.max(12, Math.min(95, ((telemetry.rmsRight + 48) / 48) * 100))
    : 12;

  const leftDisplay = isPlaying
    ? `${telemetry.rmsLeft.toFixed(1)} dB RMS / ${telemetry.peakLeft.toFixed(1)} dB PEAK`
    : '-14.2 dB RMS / -0.8 dB PEAK';
  const rightDisplay = isPlaying
    ? `${telemetry.rmsRight.toFixed(1)} dB RMS / ${telemetry.peakRight.toFixed(1)} dB PEAK`
    : '-15.0 dB RMS / -1.1 dB PEAK';

  const handleSeekClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onSeek) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onSeek(ratio * totalDurationMs);
  };

  return (
    <div className="flex flex-col w-full pb-8 gap-6 max-w-5xl mx-auto">
      {/* Top Main Showcase Card: Vinyl Sleeve & Playback Console */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 bg-surface-bright p-5 md:p-6 border-2 border-outline shadow-md items-center">
        {/* Vinyl Reproduction Sleeve Art */}
        <div className="md:col-span-5 flex flex-col items-center">
          <div className="relative aspect-square w-full max-w-[340px] bg-surface-container-lowest overflow-hidden shadow-[4px_4px_0px_#1a1a1a] border-2 border-outline group">
            <img
              src={track.coverUrl}
              alt={track.title}
              className="w-full h-full object-cover filter contrast-125 saturate-75 transition-transform duration-700 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-primary/90 via-primary/20 to-transparent flex flex-col justify-end p-4">
              <span className="bg-primary text-on-primary px-2 py-0.5 text-[10px] font-label font-bold tracking-widest uppercase w-max mb-1.5 border border-primary-container">
                Master Tape Transfer
              </span>
              <span className="font-headline font-bold text-xs text-primary-container uppercase tracking-wider">
                {track.album}
              </span>
            </div>
          </div>
        </div>

        {/* Track Details & Intuitive Primary Controls */}
        <div className="md:col-span-7 flex flex-col gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 bg-primary-container text-on-primary-container font-headline text-[10px] font-bold uppercase border border-outline">
                {track.format} {track.sampleRate}
              </span>
              <span
                className={`px-2 py-0.5 font-headline text-[10px] font-bold uppercase border border-outline ${
                  isBitPerfect ? 'bg-surface text-tertiary' : 'bg-secondary text-white'
                }`}
              >
                {isBitPerfect ? '● Bit-Perfect 1:1' : 'DSP Active'}
              </span>
            </div>
            <h1 className="font-headline font-bold text-2xl md:text-3xl text-on-surface uppercase tracking-tight leading-tight">
              {track.title}
            </h1>
            <p className="font-body text-sm font-semibold text-on-surface-variant mt-1">
              {track.artist}
            </p>
          </div>

          {/* Interactive Seek Bar */}
          <div className="flex flex-col gap-1.5 pt-2">
            <div
              onClick={handleSeekClick}
              className="w-full h-3 bg-surface-container-high border-2 border-outline relative cursor-pointer group"
              title="Geser Playhead"
            >
              <div
                className="h-full bg-primary transition-all duration-75 relative"
                style={{ width: `${progressPercent}%` }}
              >
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-4 bg-primary-container border border-outline shadow-sm"></div>
              </div>
            </div>
            <div className="flex justify-between items-center text-[11px] font-mono font-bold text-on-surface-variant">
              <span>{formatTimecodeCentiseconds(telemetry.currentTimeMs)}</span>
              <span className="text-[10px] font-label uppercase text-on-surface-variant">
                {track.bitrate}
              </span>
              <span>{formatTimecodeCentiseconds(totalDurationMs)}</span>
            </div>
          </div>

          {/* Large Touch Controls */}
          <div className="flex items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-2">
              {onPrev && (
                <button
                  onClick={onPrev}
                  className="w-11 h-11 bg-surface hover:bg-surface-container border-2 border-outline shadow-[2px_2px_0px_#1a1a1a] flex items-center justify-center text-on-surface cursor-pointer active:translate-y-0.5"
                  title="Lagu Sebelumnya"
                  aria-label="Lagu Sebelumnya"
                >
                  <span className="material-symbols-outlined text-2xl">skip_previous</span>
                </button>
              )}
              <button
                onClick={onTogglePlay}
                className="h-12 px-6 bg-primary-container text-on-primary-container hover:bg-primary hover:text-white border-2 border-outline shadow-[3px_3px_0px_#1a1a1a] flex items-center justify-center gap-2 font-headline font-bold text-sm uppercase tracking-wider transition-all cursor-pointer active:translate-x-0.5 active:translate-y-0.5"
                title={isPlaying ? 'Jeda' : 'Putar'}
                aria-label={isPlaying ? 'Jeda' : 'Putar'}
              >
                <span className="material-symbols-outlined text-3xl">
                  {isPlaying ? 'pause' : 'play_arrow'}
                </span>
                <span>{isPlaying ? 'Jeda' : 'Putar'}</span>
              </button>
              {onNext && (
                <button
                  onClick={onNext}
                  className="w-11 h-11 bg-surface hover:bg-surface-container border-2 border-outline shadow-[2px_2px_0px_#1a1a1a] flex items-center justify-center text-on-surface cursor-pointer active:translate-y-0.5"
                  title="Lagu Selanjutnya"
                  aria-label="Lagu Selanjutnya"
                >
                  <span className="material-symbols-outlined text-2xl">skip_next</span>
                </button>
              )}
            </div>

            {/* Quick Toggle for Signal Inspector */}
            <button
              onClick={() => setShowSignalInspector(!showSignalInspector)}
              className="flex items-center gap-1.5 px-3 py-2 bg-surface hover:bg-surface-container text-xs font-label font-bold uppercase text-on-surface border-2 border-outline shadow-[2px_2px_0px_#1a1a1a] cursor-pointer"
            >
              <span className="material-symbols-outlined text-base text-tertiary">
                {showSignalInspector ? 'visibility_off' : 'stream'}
              </span>
              <span>{showSignalInspector ? 'Tutup Rincian' : 'Audit Sinyal (DAC)'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Real-Time Hardware VU Meters (Essential visual feedback) */}
      <div className="bg-surface-bright p-5 border-2 border-outline shadow-sm flex flex-col gap-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-tertiary">graphic_eq</span>
            <h3 className="font-headline text-xs uppercase tracking-wider font-bold text-on-surface">
              Indikator Level Output Audio (RMS / True-Peak dBFS)
            </h3>
          </div>
          <span className="font-mono text-[10px] text-on-surface-variant font-bold bg-surface-container px-2 py-0.5 border border-outline/20">
            REF: 0 dBFS
          </span>
        </div>

        {/* Left Channel */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-[10px] font-mono font-bold text-on-surface">
            <span>CH 1 (KIRI)</span>
            <span>{leftDisplay}</span>
          </div>
          <div className="w-full h-3 bg-surface-container-high relative overflow-hidden flex border border-outline">
            <div
              className="h-full bg-primary transition-all duration-75"
              style={{ width: `${leftPercent}%` }}
            ></div>
            <div className="absolute top-0 bottom-0 w-0.5 bg-secondary right-12 z-10"></div>
          </div>
        </div>

        {/* Right Channel */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-[10px] font-mono font-bold text-on-surface">
            <span>CH 2 (KANAN)</span>
            <span>{rightDisplay}</span>
          </div>
          <div className="w-full h-3 bg-surface-container-high relative overflow-hidden flex border border-outline">
            <div
              className="h-full bg-primary transition-all duration-75"
              style={{ width: `${rightPercent}%` }}
            ></div>
            <div className="absolute top-0 bottom-0 w-0.5 bg-secondary right-14 z-10"></div>
          </div>
        </div>

        {/* Scale */}
        <div className="flex justify-between text-[9px] font-mono text-on-surface-variant tracking-tighter pt-0.5 select-none">
          <span>-∞</span>
          <span>-40</span>
          <span>-24</span>
          <span>-18</span>
          <span>-12</span>
          <span>-6</span>
          <span className="text-secondary font-bold">0 dB</span>
          <span className="text-secondary font-bold">+3</span>
        </div>
      </div>

      {/* Collapsible Advanced Section: Full 5-Stage Pipeline Inspector & Technical Inode */}
      {showSignalInspector && (
        <div className="flex flex-col gap-5 bg-surface-container-low p-5 md:p-6 border-2 border-outline shadow-md animate-fade-in">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b-2 border-outline">
            <div>
              <div className="flex items-center gap-2">
                <span className="bg-primary-container text-on-primary-container text-[10px] font-label font-bold px-2 py-0.5 uppercase border border-outline">
                  Arsitektur Pipeline
                </span>
                <span className="font-headline font-bold text-sm uppercase">Audit Jalur Sinyal Audio Digital</span>
              </div>
              <p className="font-body text-xs text-on-surface-variant mt-0.5">
                Alur data dari storage penyimpanan lokal langsung menuju konverter digital-ke-analog (DAC).
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold bg-primary text-white px-2.5 py-1 border border-outline">
                Bit-Perfect: {isBitPerfect ? 'Aktif (1:1)' : 'Tergantikan DSP'}
              </span>
            </div>
          </div>

          {/* 5 Stages Flow */}
          <div className="flex flex-col gap-2.5">
            {/* Stage 1 */}
            <div className="p-3.5 bg-surface-bright border border-outline flex justify-between items-start">
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 bg-primary text-white font-headline font-bold text-xs flex items-center justify-center shrink-0">
                  01
                </div>
                <div>
                  <span className="text-[10px] font-label uppercase font-bold text-on-surface-variant block">
                    Tahap 1: Kontainer Sumber File
                  </span>
                  <span className="font-headline font-bold text-sm text-on-surface">
                    {track.format} {track.sampleRate} / {track.bitDepth} Lossless
                  </span>
                  <div className="mt-1 flex gap-2 font-mono text-[10px] text-on-surface-variant">
                    <span>Clock: {track.sampleRateNum.toLocaleString()} Hz</span>
                    <span>•</span>
                    <span>Format: 2 Channel Stereo</span>
                  </div>
                </div>
              </div>
              <span className="text-[10px] font-label font-bold bg-surface-container px-2 py-0.5 border border-outline">
                Master Asli
              </span>
            </div>

            {/* Stage 2 */}
            <div className="p-3.5 bg-surface-bright border border-outline flex justify-between items-start">
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 bg-primary text-white font-headline font-bold text-xs flex items-center justify-center shrink-0">
                  02
                </div>
                <div>
                  <span className="text-[10px] font-label uppercase font-bold text-on-surface-variant block">
                    Tahap 2: Decoding Kernel
                  </span>
                  <span className="font-headline font-bold text-sm text-on-surface">
                    Symphonia Native Rust Engine
                  </span>
                  <div className="mt-1 flex gap-2 font-mono text-[10px] text-on-surface-variant">
                    <span>Output: 32-bit Float PCM</span>
                    <span>•</span>
                    <span>Jitter Margin: 0.00 ns</span>
                  </div>
                </div>
              </div>
              <span className="text-[10px] font-label font-bold bg-surface-container px-2 py-0.5 border border-outline">
                Lossless
              </span>
            </div>

            {/* Stage 3 */}
            <div className="p-3.5 bg-surface-bright border border-outline flex justify-between items-start">
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 bg-surface-variant text-on-surface font-headline font-bold text-xs flex items-center justify-center shrink-0 border border-outline">
                  03
                </div>
                <div>
                  <span className="text-[10px] font-label uppercase font-bold text-on-surface-variant block">
                    Tahap 3: Pemrosesan DSP &amp; Efek
                  </span>
                  <span className="font-headline font-bold text-sm text-on-surface">
                    {isBitPerfect ? 'DSP Bypassed (Jalur Murni)' : 'Parametric Equalizer Aktif'}
                  </span>
                  <div className="mt-1 flex gap-2 font-mono text-[10px] text-on-surface-variant">
                    <span>Equalizer: {isBitPerfect ? 'Bypass' : 'Active'}</span>
                    <span>•</span>
                    <span>Limiter: {isBitPerfect ? 'Off' : 'Active'}</span>
                  </div>
                </div>
              </div>
              <span
                className={`text-[10px] font-label font-bold px-2 py-0.5 border border-outline ${
                  isBitPerfect ? 'bg-secondary-fixed text-secondary' : 'bg-primary-container text-on-primary-container'
                }`}
              >
                {isBitPerfect ? 'BYPASS ACTIVE' : 'PROCESSED'}
              </span>
            </div>

            {/* Stage 4 */}
            <div className="p-3.5 bg-surface-bright border border-outline flex justify-between items-start">
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 bg-primary text-white font-headline font-bold text-xs flex items-center justify-center shrink-0">
                  04
                </div>
                <div>
                  <span className="text-[10px] font-label uppercase font-bold text-on-surface-variant block">
                    Tahap 4: Driver Output Host
                  </span>
                  <span className="font-headline font-bold text-sm text-on-surface">
                    {isSharedMode ? 'Windows Shared Audio Mixer' : 'WASAPI Exclusive Host Driver'}
                  </span>
                  <div className="mt-1 flex gap-2 font-mono text-[10px] text-on-surface-variant">
                    <span>Buffer: 128 samples</span>
                    <span>•</span>
                    <span>Latensi: 2.6 ms</span>
                  </div>
                </div>
              </div>
              <span className="text-[10px] font-label font-bold bg-tertiary-container text-tertiary px-2 py-0.5 border border-outline">
                {isSharedMode ? 'Shared' : 'Exclusive Mode'}
              </span>
            </div>

            {/* Stage 5 */}
            <div className="p-3.5 bg-primary text-white border-2 border-outline flex justify-between items-start">
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 bg-primary-container text-primary font-headline font-bold text-xs flex items-center justify-center shrink-0">
                  05
                </div>
                <div>
                  <span className="text-[10px] font-label uppercase font-bold text-surface-dim block">
                    Tahap 5: Endpoint Hardware DAC
                  </span>
                  <span className="font-headline font-bold text-sm text-white">
                    Topping D90 III Sabre Flagship DAC (Dual ES9039SPRO)
                  </span>
                  <div className="mt-1 flex gap-2 font-mono text-[10px] text-surface-dim">
                    <span>Lock: {forceResample ? '48.0 kHz' : `${track.sampleRate} Native`}</span>
                    <span>•</span>
                    <span>Clock: Femtosecond Accusilicon</span>
                  </div>
                </div>
              </div>
              <span className="text-[10px] font-label font-bold bg-primary-container text-on-primary-container px-2 py-0.5">
                Terkunci 1:1
              </span>
            </div>
          </div>

          {/* Optional Driver Diagnostics Toggles */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
            <div className="p-3 bg-surface-bright border border-outline flex items-center justify-between">
              <div>
                <span className="font-headline text-xs font-bold text-on-surface block">Tes Paksa Resample (48kHz)</span>
                <span className="text-[10px] font-body text-on-surface-variant">Untuk pengujian komparasi non-bit-perfect</span>
              </div>
              <button
                onClick={() => setForceResample(!forceResample)}
                className={`px-2.5 py-1 text-[10px] font-headline font-bold uppercase border border-outline cursor-pointer ${
                  forceResample ? 'bg-secondary text-white' : 'bg-surface-container'
                }`}
              >
                {forceResample ? 'Aktif (48k)' : 'Nonaktif'}
              </button>
            </div>

            <div className="p-3 bg-surface-bright border border-outline flex items-center justify-between">
              <div>
                <span className="font-headline text-xs font-bold text-on-surface block">Mode Host Driver</span>
                <span className="text-[10px] font-body text-on-surface-variant">Pilihan antara Exclusive atau Shared Mixer</span>
              </div>
              <button
                onClick={() => setIsSharedMode(!isSharedMode)}
                className={`px-2.5 py-1 text-[10px] font-headline font-bold uppercase border border-outline cursor-pointer ${
                  !isSharedMode ? 'bg-primary text-white' : 'bg-surface-container'
                }`}
              >
                {!isSharedMode ? 'Exclusive' : 'Shared Mixer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
