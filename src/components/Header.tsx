import React, { useState } from 'react';
import { AppView } from '../types/audio';

interface HeaderProps {
  currentView: AppView;
  onSelectView: (view: AppView) => void;
}

const NAV_ITEMS: { id: AppView; label: string; icon: string }[] = [
  { id: 'now-playing-and-signal-path', label: 'Pemutar', icon: 'music_note' },
  { id: 'library-and-tracks', label: 'Library', icon: 'library_music' },
  { id: 'equalizer-and-dsp', label: 'Equalizer', icon: 'equalizer' },
  { id: 'lyrics-editor', label: 'Lirik', icon: 'subtitles' },
  { id: 'audio-output-settings', label: 'Pengaturan', icon: 'settings' },
];

export const Header: React.FC<HeaderProps> = ({ currentView, onSelectView }) => {
  const [menuOpen, setMenuOpen] = useState(false);

  const selectView = (view: AppView) => {
    onSelectView(view);
    setMenuOpen(false);
  };

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50 flex h-14 items-center gap-3 border-b border-outline/20 bg-surface-bright/95 px-3 backdrop-blur-md sm:px-5">
        <button
          type="button"
          aria-label={menuOpen ? 'Tutup menu navigasi' : 'Buka menu navigasi'}
          aria-expanded={menuOpen}
          aria-controls="mplayer-navigation"
          onClick={() => setMenuOpen((open) => !open)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-outline/20 bg-surface hover:bg-surface-container active:scale-[0.98]"
        >
          <span className="material-symbols-outlined text-xl">{menuOpen ? 'close' : 'menu'}</span>
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-container">
            <span className="material-symbols-outlined text-xl">graphic_eq</span>
          </span>
          <div className="min-w-0">
            <div className="truncate font-headline text-sm font-bold uppercase tracking-[0.12em] text-on-surface">MPlayer</div>
            <div className="text-[10px] font-medium tracking-wide text-on-surface-variant">LOCAL PLAYER PREVIEW</div>
          </div>
        </div>
        <span className="hidden rounded-full border border-outline/20 px-3 py-1 text-[11px] font-medium text-on-surface-variant sm:inline-flex">
          Native output belum terhubung
        </span>
      </header>

      {menuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30"
          onClick={() => setMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        id="mplayer-navigation"
        aria-label="Navigasi utama"
        className={
          'fixed bottom-0 left-0 top-14 z-50 flex w-[min(84vw,320px)] flex-col border-r border-outline/15 bg-surface-bright p-3 shadow-xl transition-transform duration-200 ' +
          (menuOpen ? 'translate-x-0' : '-translate-x-full pointer-events-none')
        }
        aria-hidden={!menuOpen}
      >
        <div className="px-3 pb-3 pt-2">
          <div className="text-xs font-bold uppercase tracking-wider text-on-surface">Menu utama</div>
          <div className="mt-1 text-xs text-on-surface-variant">Pilih bagian yang ingin dibuka</div>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const active = currentView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                tabIndex={menuOpen ? 0 : -1}
                onClick={() => selectView(item.id)}
                className={
                  'flex min-h-12 items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold transition-colors ' +
                  (active ? 'bg-primary-container text-on-primary-container' : 'text-on-surface hover:bg-surface-container')
                }
              >
                <span className="material-symbols-outlined text-xl">{item.icon}</span>
                <span className="flex-1">{item.label}</span>
                {active && <span className="material-symbols-outlined text-lg">check</span>}
              </button>
            );
          })}
        </nav>
        <div className="mt-auto border-t border-outline/15 px-3 py-3 text-[11px] leading-relaxed text-on-surface-variant">
          Fitur native seperti WASAPI dan database lokal belum terhubung pada preview web ini.
        </div>
      </aside>
    </>
  );
};
