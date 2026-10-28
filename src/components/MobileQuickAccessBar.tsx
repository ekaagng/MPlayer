import React from 'react';
import { AppView } from '../types/audio';

interface MobileQuickAccessBarProps {
  currentView: AppView;
  onSelectView: (view: AppView) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onQuickSearch: () => void;
}

export const MobileQuickAccessBar: React.FC<MobileQuickAccessBarProps> = ({
  currentView,
  onSelectView,
  isPlaying,
  onTogglePlay,
  onQuickSearch,
}) => {
  const quickLinks: { id: AppView; label: string; icon: string }[] = [
    { id: 'library-and-tracks', label: 'Vault', icon: 'folder_open' },
    { id: 'now-playing-and-signal-path', label: 'Player', icon: 'album' },
    { id: 'equalizer-and-dsp', label: 'EQ', icon: 'tune' },
    { id: 'lyrics-editor', label: 'Lyrics', icon: 'subtitles' },
    { id: 'audio-output-settings', label: 'Output', icon: 'settings_input_component' },
  ];

  return (
    <div className="lg:hidden sticky top-10 z-40 bg-surface-container-high/95 backdrop-blur-md border-b-2 border-outline px-2 py-1.5 shadow-sm">
      <div className="flex items-center justify-between gap-1.5 overflow-x-auto no-scrollbar">
        {/* Quick Search Shortcut */}
        <button
          onClick={onQuickSearch}
          className="flex items-center gap-1 px-2.5 py-1 bg-surface-container-lowest border border-outline text-[11px] font-label font-bold uppercase tracking-tight text-on-surface hover:bg-primary-container shrink-0 shadow-[1px_1px_0px_#1a1a1a] active:translate-x-0.5 active:translate-y-0.5"
          title="Quick Search"
        >
          <span className="material-symbols-outlined text-[15px] text-tertiary">search</span>
          <span>Cari</span>
        </button>

        {/* Quick Route Pills */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          {quickLinks.map((item) => {
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectView(item.id)}
                className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-headline font-bold uppercase tracking-wider transition-all shrink-0 border border-outline shadow-[1px_1px_0px_#1a1a1a] ${
                  isActive
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface text-on-surface hover:bg-surface-container-highest'
                }`}
              >
                <span className="material-symbols-outlined text-[14px]">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Quick Play/Pause Badge Button */}
        <button
          onClick={onTogglePlay}
          className={`px-2 py-1 flex items-center justify-center border border-outline shadow-[1px_1px_0px_#1a1a1a] shrink-0 font-label text-[10px] font-bold uppercase ${
            isPlaying ? 'bg-primary-container text-on-primary-container' : 'bg-surface text-on-surface'
          }`}
          title={isPlaying ? 'Pause Audio' : 'Play Audio'}
        >
          <span className="material-symbols-outlined text-[16px]">
            {isPlaying ? 'pause' : 'play_arrow'}
          </span>
        </button>
      </div>
    </div>
  );
};
