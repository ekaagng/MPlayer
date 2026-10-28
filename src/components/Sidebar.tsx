import React from 'react';
import { AppView } from '../types/audio';

interface SidebarProps {
  currentView: AppView;
  onSelectView: (view: AppView) => void;
  isPlaying: boolean;
  trackCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onSelectView,
  isPlaying,
  trackCount = 0,
}) => {
  const navItems: { id: AppView; label: string; icon: string }[] = [
    { id: 'library-and-tracks', label: 'Library & Tracks', icon: 'audio_file' },
    { id: 'now-playing-and-signal-path', label: 'Now Playing & Signal Path', icon: 'file_download_done' },
    { id: 'equalizer-and-dsp', label: 'Equalizer & DSP', icon: 'equalizer' },
    { id: 'lyrics-editor', label: 'Lyrics Editor', icon: 'subtitles' },
    { id: 'audio-output-settings', label: 'Audio Output Settings', icon: 'tune' },
  ];

  return (
    <aside className="hidden lg:flex fixed left-0 top-10 bottom-24 w-64 bg-surface-container-low border-r-2 border-outline z-40 flex-col justify-between">
      <div className="flex flex-col">
        <div className="p-3 border-b-2 border-outline bg-surface-container">
          <span className="font-label font-bold text-[10px] uppercase tracking-widest text-on-surface-variant block">
            Routing / Directory
          </span>
        </div>
        <nav className="flex flex-col py-2">
          {navItems.map((item) => {
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectView(item.id)}
                className={`flex items-center gap-3 px-4 py-2.5 text-xs font-label uppercase font-bold transition-colors text-left ${
                  isActive
                    ? 'bg-primary-container text-on-primary-container font-bold border-l-4 border-l-outline'
                    : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Core Engine Telemetry */}
      <div className="p-3 border-t-2 border-outline bg-surface-container-high flex flex-col gap-2">
        <div className="flex items-center justify-between text-[10px] font-label font-bold">
          <span className="uppercase text-on-surface-variant">Core State:</span>
          <span
            className={`px-1.5 py-0.2 border border-outline uppercase font-mono ${
              isPlaying
                ? 'bg-primary-container text-on-primary-container font-bold animate-pulse'
                : 'bg-surface text-tertiary'
            }`}
          >
            {isPlaying ? 'Streaming Active' : 'Idle'}
          </span>
        </div>
        <div className="text-[11px] font-mono font-semibold text-on-surface tracking-tight border border-outline bg-surface-bright p-1.5 shadow-[2px_2px_0px_#1a1a1a]">
          {trackCount.toLocaleString()} demo tracks • native database not connected
        </div>
      </div>
    </aside>
  );
};
