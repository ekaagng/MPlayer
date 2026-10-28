import React from 'react';

interface HeaderProps {
  currentTrackFormat?: string;
  isMobile?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ currentTrackFormat = 'WASAPI Exclusive • 192kHz/24-bit' }) => {
  return (
    <header className="fixed top-0 left-0 right-0 h-10 md:h-10 bg-surface-container-highest border-b-2 border-outline z-50 flex items-center justify-between px-3">
      {/* Brand & Offline status */}
      <div className="flex items-center gap-2 md:gap-3">
        <div className="flex items-center gap-2 pr-2 md:pr-3 border-r-2 border-outline">
          <span className="material-symbols-outlined text-[18px] text-tertiary font-bold">graphic_eq</span>
          <span className="font-headline font-bold text-xs uppercase tracking-wider text-primary">
            Resonance Core
          </span>
        </div>
        <div className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 bg-surface-container border border-outline text-[11px] font-label font-bold uppercase text-on-surface">
          <span className="w-1.5 h-1.5 rounded-full bg-tertiary"></span>
          <span>100% Offline / Local Engine</span>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-primary-container border border-outline text-[10px] md:text-[11px] font-label font-bold text-on-primary-container uppercase truncate max-w-[200px] md:max-w-none">
          <span className="material-symbols-outlined text-[14px]">album</span>
          <span className="truncate">{currentTrackFormat}</span>
        </div>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-2">
        <div className="hidden sm:flex items-center gap-1 text-[11px] font-label font-bold text-on-surface mr-1">
          <span className="material-symbols-outlined text-sm leading-none">battery_charging_full</span>
          <span>98%</span>
        </div>
        <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-primary flex items-center justify-center cursor-pointer shadow-sm">
          <span className="material-symbols-outlined text-on-primary text-[16px] md:text-[18px]">person</span>
        </div>
        <div className="hidden sm:flex items-center border-l-2 border-outline pl-2">
          <button
            aria-label="Minimize Window"
            className="w-7 h-7 flex items-center justify-center text-on-surface hover:bg-surface-container-high transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">minimize</span>
          </button>
          <button
            aria-label="Maximize Window"
            className="w-7 h-7 flex items-center justify-center text-on-surface hover:bg-surface-container-high transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">crop_square</span>
          </button>
          <button
            aria-label="Close Window"
            className="w-7 h-7 flex items-center justify-center text-on-surface hover:bg-secondary hover:text-white transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>
      </div>
    </header>
  );
};
