import React from 'react';
import { Track, AppView } from '../types/audio';

interface MobileNavigationProps {
  currentView: AppView;
  onSelectView: (view: AppView) => void;
  currentTrack: Track | null;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;
}

export const MobileNavigation: React.FC<MobileNavigationProps> = ({
  currentView,
  onSelectView,
  currentTrack,
  isPlaying,
  onTogglePlay,
  onPrev,
  onNext,
}) => {
  const tabs: { id: AppView; label: string; icon: string }[] = [
    { id: 'library-and-tracks', label: 'Library', icon: 'folder_open' },
    { id: 'now-playing-and-signal-path', label: 'Player', icon: 'radio' },
    { id: 'equalizer-and-dsp', label: 'EQ', icon: 'tune' },
    { id: 'lyrics-editor', label: 'Lyrics', icon: 'subtitles' },
    { id: 'audio-output-settings', label: 'Output', icon: 'cable' },
  ];

  const trackTitle = currentTrack?.title || 'Solaris Echoes // Movement IV';
  const trackSub = currentTrack
    ? `${currentTrack.sampleRate} / ${currentTrack.bitDepth} ${currentTrack.format}`
    : '384kHz / 32-bit PCM';

  return (
    <div className="lg:hidden">
      {/* Floating Mini Player (Shown when not on Now Playing view) */}
      {currentView !== 'now-playing-and-signal-path' && (
        <div className="fixed bottom-20 w-full z-40 px-3 pointer-events-none">
          <div className="pointer-events-auto bg-surface-container-highest shadow-[0_4px_16px_rgba(0,0,0,0.12)] border border-outline px-3 py-2 flex items-center justify-between gap-3">
            <div
              className="flex items-center gap-3 overflow-hidden cursor-pointer flex-1"
              onClick={() => onSelectView('now-playing-and-signal-path')}
            >
              <div className="w-9 h-9 bg-primary flex-shrink-0 flex items-center justify-center">
                <span className="material-symbols-outlined text-primary-container text-xl">graphic_eq</span>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-headline font-bold text-on-surface truncate leading-tight uppercase">
                  {trackTitle}
                </span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="px-1 text-[9px] font-label font-bold uppercase bg-primary-container text-on-primary-container">
                    BIT-PERFECT
                  </span>
                  <span className="text-[10px] font-body text-on-surface-variant truncate">{trackSub}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                aria-label="Previous Track"
                onClick={onPrev}
                className="w-10 h-10 flex items-center justify-center text-on-surface hover:text-secondary"
              >
                <span className="material-symbols-outlined text-2xl">skip_previous</span>
              </button>
              <button
                aria-label={isPlaying ? 'Pause' : 'Play'}
                onClick={onTogglePlay}
                className="w-10 h-10 bg-primary text-primary-container flex items-center justify-center hover:bg-primary/90"
              >
                <span className="material-symbols-outlined text-2xl">
                  {isPlaying ? 'pause' : 'play_arrow'}
                </span>
              </button>
              <button
                aria-label="Next Track"
                onClick={onNext}
                className="w-10 h-10 flex items-center justify-center text-on-surface hover:text-secondary"
              >
                <span className="material-symbols-outlined text-2xl">skip_next</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5-Tab Bottom Safe-Area Nav */}
      <nav className="fixed bottom-0 w-full z-50 pb-safe bg-surface/95 backdrop-blur-xl border-t-2 border-outline shadow-lg">
        <div className="h-20 px-2 grid grid-cols-5 items-center">
          {tabs.map((tab) => {
            const isActive = currentView === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onSelectView(tab.id)}
                className={`flex flex-col items-center justify-center h-14 min-w-[44px] transition-colors ${
                  isActive
                    ? 'text-on-surface bg-surface-container-highest font-bold'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <span className="material-symbols-outlined text-2xl">{tab.icon}</span>
                <span className="text-[10px] font-label font-bold tracking-tight uppercase mt-1">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};
