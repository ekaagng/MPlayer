import React from 'react';
import { Track, AppView } from '../types/audio';
import { formatTimecodeCentiseconds } from '../utils/audioMath';

interface BottomPlayerProps {
  currentTrack: Track | null;
  isPlaying: boolean;
  currentTimeMs: number;
  durationMs: number;
  volume: number;
  isBitPerfect: boolean;
  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSeek: (ms: number) => void;
  onVolumeChange: (vol: number) => void;
  onNavigate: (view: AppView) => void;
}

export const BottomPlayer: React.FC<BottomPlayerProps> = ({
  currentTrack,
  isPlaying,
  currentTimeMs,
  durationMs,
  volume,
  isBitPerfect,
  onTogglePlay,
  onPrev,
  onNext,
  onSeek,
  onVolumeChange,
  onNavigate,
}) => {
  const [isShuffle, setIsShuffle] = React.useState(false);
  const [repeatMode, setRepeatMode] = React.useState<'off' | 'all' | 'one'>('off');

  const totalDurationMs = durationMs || (currentTrack ? currentTrack.duration * 1000 : 442000);
  const progressRatio = totalDurationMs > 0 ? Math.min(1, Math.max(0, currentTimeMs / totalDurationMs)) : 0;

  const handleSeekClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    onSeek(ratio * totalDurationMs);
  };

  const handleVolumeClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const newVol = Math.max(0, Math.min(1, clickX / rect.width));
    onVolumeChange(newVol);
  };

  const toggleRepeat = () => {
    setRepeatMode((prev) => (prev === 'off' ? 'all' : prev === 'all' ? 'one' : 'off'));
  };

  const trackTitle = currentTrack?.title || 'Symphony No. 5 in C Minor, Op. 67';
  const trackArtist = currentTrack?.artist || 'Wiener Philharmoniker, Carlos Kleiber';
  const formatBadge = currentTrack
    ? `${currentTrack.format} ${currentTrack.sampleRate} / ${currentTrack.bitDepth} ${currentTrack.bitrate}`
    : 'FLAC 96kHz / 24-bit 2840kbps';

  return (
    <footer className="hidden lg:flex fixed bottom-0 left-0 right-0 h-24 bg-surface-bright border-t-2 border-outline z-50 items-center justify-between px-4">
      {/* Track Media Descriptor */}
      <div className="flex items-center gap-4 w-80 min-w-[280px]">
        <div className="w-14 h-14 bg-surface-container-highest border-2 border-outline shadow-[2px_2px_0px_#1a1a1a] flex items-center justify-center flex-shrink-0 overflow-hidden">
          {currentTrack?.coverUrl ? (
            <img src={currentTrack.coverUrl} alt={trackTitle} className="w-full h-full object-cover filter contrast-125" />
          ) : (
            <span className="material-symbols-outlined text-[28px] text-primary">art_track</span>
          )}
        </div>
        <div className="flex flex-col min-w-0">
          <span className="font-headline font-bold text-sm text-on-surface truncate tracking-tight" title={trackTitle}>
            {trackTitle}
          </span>
          <span className="font-body text-xs text-on-surface-variant truncate" title={trackArtist}>
            {trackArtist}
          </span>
          <div className="mt-1 inline-flex items-center w-max px-1.5 py-0.2 bg-surface-container-high border border-outline text-[9px] font-mono font-bold text-on-surface">
            <span className="text-tertiary mr-1">●</span>
            {formatBadge}
          </div>
        </div>
      </div>

      {/* Main Transport Controls & Precision Scrubber */}
      <div className="flex flex-col items-center flex-1 max-w-2xl px-6">
        <div className="flex items-center gap-4 mb-1.5">
          <button
            aria-label="Toggle Shuffle"
            onClick={() => setIsShuffle(!isShuffle)}
            className={`p-1 transition-colors ${
              isShuffle ? 'text-tertiary font-bold' : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">shuffle</span>
          </button>
          <button
            aria-label="Previous Track"
            onClick={onPrev}
            className="p-1 text-on-surface hover:bg-surface-container transition-colors border border-outline active:translate-y-0.5"
          >
            <span className="material-symbols-outlined text-[20px]">skip_previous</span>
          </button>
          <button
            aria-label={isPlaying ? 'Pause' : 'Play'}
            onClick={onTogglePlay}
            className="w-9 h-9 bg-primary-container text-on-primary-container border-2 border-outline shadow-[2px_2px_0px_#1a1a1a] flex items-center justify-center hover:bg-primary hover:text-on-primary active:translate-x-0.5 active:translate-y-0.5 transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-[22px]">
              {isPlaying ? 'pause' : 'play_arrow'}
            </span>
          </button>
          <button
            aria-label="Next Track"
            onClick={onNext}
            className="p-1 text-on-surface hover:bg-surface-container transition-colors border border-outline active:translate-y-0.5"
          >
            <span className="material-symbols-outlined text-[20px]">skip_next</span>
          </button>
          <button
            aria-label="Toggle Repeat Mode"
            onClick={toggleRepeat}
            className={`p-1 transition-colors ${
              repeatMode !== 'off' ? 'text-secondary font-bold' : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">
              {repeatMode === 'one' ? 'repeat_one' : 'repeat'}
            </span>
          </button>
        </div>

        {/* Timecode and scrubber bar */}
        <div className="flex items-center gap-3 w-full">
          <span className="text-[10px] font-mono font-bold text-on-surface-variant w-16 text-right select-none">
            {formatTimecodeCentiseconds(currentTimeMs)}
          </span>
          <div
            onClick={handleSeekClick}
            className="flex-1 h-2 bg-surface-container-high border border-outline relative cursor-pointer group"
            title="Seek Playhead"
          >
            <div
              className="h-full bg-primary transition-all duration-75 relative"
              style={{ width: `${progressRatio * 100}%` }}
            >
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-4 bg-primary-container border border-outline opacity-0 group-hover:opacity-100 transition-opacity"></div>
            </div>
          </div>
          <span className="text-[10px] font-mono font-bold text-on-surface-variant w-16 select-none">
            {formatTimecodeCentiseconds(totalDurationMs)}
          </span>
        </div>
      </div>

      {/* Bit-Perfect verification, Volume, and Quick Drawer Links */}
      <div className="flex items-center gap-4 w-80 justify-end">
        <div
          className={`flex items-center gap-1 px-1.5 py-1 border border-outline text-[10px] font-label font-bold uppercase ${
            isBitPerfect
              ? 'bg-surface-container-low text-on-surface'
              : 'bg-secondary-fixed text-secondary'
          }`}
        >
          <span className="material-symbols-outlined text-[14px] text-tertiary">lock</span>
          <span>{isBitPerfect ? 'Bit-Perfect' : 'DSP Active'}</span>
        </div>

        {/* Volume */}
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-on-surface-variant">
            {volume === 0 ? 'volume_off' : volume < 0.5 ? 'volume_down' : 'volume_up'}
          </span>
          <div
            onClick={handleVolumeClick}
            className="w-20 h-2 bg-surface-container-high border border-outline cursor-pointer"
            title={`Volume: ${Math.round(volume * 100)}%`}
          >
            <div className="h-full bg-outline" style={{ width: `${volume * 100}%` }}></div>
          </div>
        </div>

        {/* Utility links */}
        <div className="flex items-center gap-1 border-l-2 border-outline pl-3">
          <button
            onClick={() => onNavigate('library-and-tracks')}
            className="p-1.5 border border-outline bg-surface hover:bg-primary hover:text-on-primary transition-colors text-on-surface"
            title="Queue / Library"
          >
            <span className="material-symbols-outlined text-[16px]">queue_music</span>
          </button>
          <button
            onClick={() => onNavigate('lyrics-editor')}
            className="p-1.5 border border-outline bg-surface hover:bg-primary hover:text-on-primary transition-colors text-on-surface"
            title="Lyrics Editor"
          >
            <span className="material-symbols-outlined text-[16px]">lyrics</span>
          </button>
          <button
            onClick={() => onNavigate('equalizer-and-dsp')}
            className="p-1.5 border border-outline bg-surface hover:bg-primary hover:text-on-primary transition-colors text-on-surface"
            title="Equalizer & DSP"
          >
            <span className="material-symbols-outlined text-[16px]">graphic_eq</span>
          </button>
        </div>
      </div>
    </footer>
  );
};
