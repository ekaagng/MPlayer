import React from 'react';
import { EqualizerState, EQFrequency } from '../types/audio';
import { calculateAutoPreamp } from '../utils/audioMath';

interface EqualizerViewProps {
  eqState: EqualizerState;
  onUpdateEq: (newState: EqualizerState) => void;
}

const BANDS: { name: EQFrequency; label: string }[] = [
  { name: '31Hz', label: '31' },
  { name: '62Hz', label: '62' },
  { name: '125Hz', label: '125' },
  { name: '250Hz', label: '250' },
  { name: '500Hz', label: '500' },
  { name: '1kHz', label: '1k' },
  { name: '2kHz', label: '2k' },
  { name: '4kHz', label: '4k' },
  { name: '8kHz', label: '8k' },
  { name: '16kHz', label: '16k' },
];

type PresetKey = Exclude<EqualizerState['preset'], 'custom'>;

const PRESETS: Record<PresetKey, { label: string; bands: Record<EQFrequency, number> }> = {
  flat: {
    label: 'Flat',
    bands: {
      '31Hz': 0, '62Hz': 0, '125Hz': 0, '250Hz': 0, '500Hz': 0,
      '1kHz': 0, '2kHz': 0, '4kHz': 0, '8kHz': 0, '16kHz': 0,
    },
  },
  harman: {
    label: 'Harman',
    bands: {
      '31Hz': 3.5, '62Hz': 2.5, '125Hz': 0.5, '250Hz': -1, '500Hz': -1.5,
      '1kHz': 0, '2kHz': 1, '4kHz': 2, '8kHz': 3, '16kHz': 0.5,
    },
  },
  audiophile: {
    label: 'Acoustic',
    bands: {
      '31Hz': 1, '62Hz': 0.5, '125Hz': 0, '250Hz': 0, '500Hz': 0,
      '1kHz': 0.5, '2kHz': 1, '4kHz': 1.5, '8kHz': 2, '16kHz': 1,
    },
  },
  bass: {
    label: 'Bass Boost',
    bands: {
      '31Hz': 6, '62Hz': 5, '125Hz': 3.5, '250Hz': 1, '500Hz': 0,
      '1kHz': -0.5, '2kHz': -1, '4kHz': 0, '8kHz': 0.5, '16kHz': 0,
    },
  },
  vocal: {
    label: 'Vocal',
    bands: {
      '31Hz': -1, '62Hz': -1, '125Hz': 0, '250Hz': 0.5, '500Hz': 1.5,
      '1kHz': 2.5, '2kHz': 3, '4kHz': 2, '8kHz': 1, '16kHz': 0.5,
    },
  },
};

export const EqualizerView: React.FC<EqualizerViewProps> = ({ eqState, onUpdateEq }) => {
  const handlePresetSelect = (preset: PresetKey) => {
    const bands = { ...PRESETS[preset].bands };
    onUpdateEq({
      ...eqState,
      preset,
      bands,
      preamp: eqState.autoPreamp ? calculateAutoPreamp(bands) : eqState.preamp,
    });
  };

  const handleBandChange = (frequency: EQFrequency, rawValue: string) => {
    if (rawValue.trim() === '') return;
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) return;
    const value = Math.max(-12, Math.min(12, Math.round(parsed * 2) / 2));
    const bands = { ...eqState.bands, [frequency]: value };
    onUpdateEq({
      ...eqState,
      bands,
      preamp: eqState.autoPreamp ? calculateAutoPreamp(bands) : eqState.preamp,
      preset: 'custom',
    });
  };

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 pb-6 sm:gap-5">
      <section className="rounded-2xl border border-outline/15 bg-surface-bright p-3 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-headline text-lg font-bold text-on-surface sm:text-xl">Equalizer</h1>
            <p className="mt-1 text-xs text-on-surface-variant">Pilih preset, atau sesuaikan 10 band secara manual.</p>
          </div>
          <button
            type="button"
            onClick={() => onUpdateEq({ ...eqState, enabled: !eqState.enabled })}
            aria-pressed={eqState.enabled}
            className={
              'min-h-10 rounded-full border px-4 text-xs font-bold transition-colors active:scale-[0.98] ' +
              (eqState.enabled
                ? 'border-primary bg-primary text-on-primary'
                : 'border-outline/20 bg-surface text-on-surface-variant')
            }
          >
            {eqState.enabled ? 'EQ Aktif' : 'EQ Nonaktif'}
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {(Object.keys(PRESETS) as PresetKey[]).map((key) => {
            const selected = eqState.preset === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => handlePresetSelect(key)}
                aria-pressed={selected}
                className={
                  'flex min-h-11 items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition-colors active:scale-[0.98] ' +
                  (selected
                    ? 'border-primary bg-primary-container text-on-primary-container'
                    : 'border-outline/15 bg-surface hover:bg-surface-container text-on-surface')
                }
              >
                <span className="truncate">{PRESETS[key].label}</span>
                {selected && <span className="material-symbols-outlined text-base">check_circle</span>}
              </button>
            );
          })}
        </div>
      </section>

      <section className="min-w-0 rounded-2xl border border-outline/15 bg-surface-bright p-2 shadow-sm sm:p-4">
        <div className="mb-3 flex items-center justify-between gap-2 px-1 sm:px-2">
          <div>
            <h2 className="font-headline text-sm font-bold text-on-surface sm:text-base">10-Band EQ</h2>
            <p className="mt-0.5 text-[10px] text-on-surface-variant sm:text-xs">Rentang −12 hingga +12 dB · langkah 0,5 dB</p>
          </div>
          <button
            type="button"
            onClick={() => handlePresetSelect('flat')}
            className="rounded-lg border border-outline/15 px-2.5 py-2 text-[10px] font-bold text-on-surface hover:bg-surface-container sm:text-xs"
          >
            Reset
          </button>
        </div>

        <div className="grid grid-cols-10 gap-1 sm:gap-2">
          {BANDS.map((band) => {
            const value = eqState.bands[band.name] ?? 0;
            const readout = value > 0 ? '+' + value.toFixed(1) : value.toFixed(1);
            const inputId = 'eq-band-' + band.name;
            return (
              <div key={band.name} className="flex min-w-0 flex-col items-center gap-1 rounded-lg bg-surface-container-low px-0.5 py-2 sm:px-1.5 sm:py-3">
                <label htmlFor={inputId} className="text-[8px] font-bold leading-none text-on-surface-variant sm:text-[10px]">
                  {band.label}
                </label>
                <span className="w-full truncate text-center font-mono text-[8px] font-bold leading-tight text-on-surface sm:text-[10px]">
                  {readout}
                </span>
                <input
                  id={inputId}
                  type="number"
                  inputMode="decimal"
                  min="-12"
                  max="12"
                  step="0.5"
                  value={value}
                  onChange={(event) => handleBandChange(band.name, event.target.value)}
                  aria-label={band.name + ' gain in decibels'}
                  className="h-8 w-full min-w-0 appearance-none rounded-md border border-outline/20 bg-surface-bright px-0 text-center font-mono text-[9px] text-on-surface outline-none focus:border-primary focus:ring-1 focus:ring-primary sm:h-9 sm:text-xs"
                />
              </div>
            );
          })}
        </div>
        <p className="mt-3 px-1 text-[10px] leading-relaxed text-on-surface-variant">
          Nilai di atas dapat diedit langsung. Perubahan manual akan mengubah preset menjadi Custom.
        </p>
      </section>
    </main>
  );
};
