import React from 'react';
import { Track } from '../types/audio';
import { formatTimecodeCentiseconds } from '../utils/audioMath';

interface NowPlayingViewProps {
  currentTrack: Track | null;
  isPlaying: boolean;
  currentTimeMs: number;
  playbackError?: string | null;
  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSeek: (ms: number) => void;
}

export const NowPlayingView: React.FC<NowPlayingViewProps> = ({
  currentTrack,
  isPlaying,
  currentTimeMs,
  playbackError,
  onTogglePlay,
  onPrev,
  onNext,
  onSeek,
}) => {
  if (!currentTrack) {
    return (
      <section className="mx-auto flex w-full max-w-xl flex-col items-center gap-3 py-16 text-center">
        <span className="material-symbols-outlined text-5xl text-on-surface-variant">music_off</span>
        <h1 className="font-headline text-lg font-bold">Belum ada lagu dipilih</h1>
        <p className="text-sm text-on-surface-variant">Buka Library dari menu untuk memilih lagu.</p>
      </section>
    );
  }

  const totalDurationMs = Math.max(0, currentTrack.duration * 1000);
  const boundedTimeMs = Math.min(totalDurationMs, Math.max(0, currentTimeMs));
  const progressPercent = totalDurationMs > 0 ? (boundedTimeMs / totalDurationMs) * 100 : 0;

  const handleSeekClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    onSeek(ratio * totalDurationMs);
  };

  const handleSeekKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 10000 : 5000;
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      onSeek(Math.min(totalDurationMs, boundedTimeMs + step));
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      onSeek(Math.max(0, boundedTimeMs - step));
    } else if (event.key === 'Home') {
      event.preventDefault();
      onSeek(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      onSeek(totalDurationMs);
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 pb-6 sm:gap-6">
      <section className="grid grid-cols-1 items-center gap-4 rounded-2xl border border-outline/15 bg-surface-bright p-3 shadow-sm sm:gap-6 sm:p-5 md:grid-cols-12 md:p-6">
        <div className="md:col-span-5">
          <div className="mx-auto aspect-square w-full max-w-[300px] overflow-hidden rounded-xl bg-surface-container-lowest sm:max-w-[340px]">
            {currentTrack.coverUrl ? (
              <img
                src={currentTrack.coverUrl}
                alt={'Sampul album ' + currentTrack.album}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-on-surface-variant">
                <span className="material-symbols-outlined text-6xl">album</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-4 md:col-span-7">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-primary-container px-2.5 py-1 text-[10px] font-bold uppercase text-on-primary-container">
                {currentTrack.format} · {currentTrack.sampleRate}
              </span>
              <span className="rounded-full border border-outline/15 px-2.5 py-1 text-[10px] font-medium text-on-surface-variant">
                {currentTrack.bitDepth}
              </span>
            </div>
            <h1 className="break-words font-headline text-xl font-bold leading-tight tracking-tight text-on-surface sm:text-2xl md:text-3xl">
              {currentTrack.title}
            </h1>
            <p className="mt-1.5 text-sm font-medium text-on-surface-variant">{currentTrack.artist}</p>
            <p className="mt-1 text-xs text-on-surface-variant">{currentTrack.album}</p>
          </div>

          <div className="flex flex-col gap-2">
            <div
              role="slider"
              aria-label="Posisi pemutaran"
              aria-valuemin={0}
              aria-valuemax={Math.round(totalDurationMs)}
              aria-valuenow={Math.round(boundedTimeMs)}
              aria-valuetext={formatTimecodeCentiseconds(boundedTimeMs)}
              tabIndex={0}
              onClick={handleSeekClick}
              onKeyDown={handleSeekKeyDown}
              className="relative h-3 w-full cursor-pointer touch-none rounded-full bg-surface-container-high outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <div className="h-full rounded-full bg-primary" style={{ width: progressPercent + '%' }} />
              <div className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-surface-bright bg-primary shadow-sm" style={{ left: 'calc(' + progressPercent + '% - 7px)' }} />
            </div>
            <div className="flex items-center justify-between gap-2 font-mono text-[10px] text-on-surface-variant sm:text-xs">
              <span>{formatTimecodeCentiseconds(boundedTimeMs)}</span>
              <span className="truncate text-center">{currentTrack.bitrate}</span>
              <span>{formatTimecodeCentiseconds(totalDurationMs)}</span>
            </div>
          </div>

          {playbackError && (
            <p role="status" className="rounded-lg border border-secondary/30 bg-secondary/10 px-3 py-2 text-xs leading-relaxed text-on-surface">
              {playbackError}
            </p>
          )}

          <div className="flex items-center justify-center gap-5 pt-1 sm:justify-start sm:gap-6">
            <button
              type="button"
              onClick={onPrev}
              aria-label="Lagu sebelumnya"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-outline/20 text-on-surface transition-colors hover:bg-surface-container active:scale-[0.97]"
            >
              <span className="material-symbols-outlined text-2xl">skip_previous</span>
            </button>
            <button
              type="button"
              onClick={onTogglePlay}
              aria-label={isPlaying ? 'Jeda pemutaran' : 'Putar lagu'}
              className="flex h-14 min-w-36 items-center justify-center gap-2 rounded-full bg-primary px-6 text-on-primary shadow-sm transition-transform active:scale-[0.98]"
            >
              <span className="material-symbols-outlined text-3xl">{isPlaying ? 'pause' : 'play_arrow'}</span>
              <span className="text-sm font-bold">{isPlaying ? 'Jeda' : 'Putar'}</span>
            </button>
            <button
              type="button"
              onClick={onNext}
              aria-label="Lagu berikutnya"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-outline/20 text-on-surface transition-colors hover:bg-surface-container active:scale-[0.97]"
            >
              <span className="material-symbols-outlined text-2xl">skip_next</span>
            </button>
          </div>
          <p className="text-center text-[11px] leading-relaxed text-on-surface-variant sm:text-left">
            Preview browser · jalur output native belum terhubung atau terverifikasi
          </p>
        </div>
      </section>
    </main>
  );
};
