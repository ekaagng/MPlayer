import React, { useState } from 'react';
import { EqualizerState, EQFrequency } from '../types/audio';
import { AudioTelemetry } from '../services/audioEngine';
import { calculateAutoPreamp } from '../utils/audioMath';

interface EqualizerViewProps {
  eqState: EqualizerState;
  onUpdateEq: (newState: EqualizerState) => void;
  telemetry: AudioTelemetry;
  isPlaying: boolean;
}

const BANDS: { name: EQFrequency; label: string; q: string; defaultGain: number }[] = [
  { name: '31Hz', label: '31Hz', q: 'Q: 1.41', defaultGain: 3.5 },
  { name: '62Hz', label: '62Hz', q: 'Q: 1.41', defaultGain: 2.5 },
  { name: '125Hz', label: '125Hz', q: 'Q: 1.41', defaultGain: 0.5 },
  { name: '250Hz', label: '250Hz', q: 'Q: 1.41', defaultGain: -1.0 },
  { name: '500Hz', label: '500Hz', q: 'Q: 1.41', defaultGain: -1.5 },
  { name: '1kHz', label: '1kHz', q: 'Q: 1.41', defaultGain: 0.0 },
  { name: '2kHz', label: '2kHz', q: 'Q: 1.41', defaultGain: 1.0 },
  { name: '4kHz', label: '4kHz', q: 'Q: 1.41', defaultGain: 2.0 },
  { name: '8kHz', label: '8kHz', q: 'Q: 1.41', defaultGain: 3.0 },
  { name: '16kHz', label: '16kHz', q: 'Q: 1.41', defaultGain: 0.5 },
];

const PRESETS: Record<string, { label: string; desc: string; bands: Record<EQFrequency, number> }> = {
  flat: {
    label: 'Flat Reference',
    desc: 'Suara asli rekaman murni tanpa warna suara buatan.',
    bands: {
      '31Hz': 0, '62Hz': 0, '125Hz': 0, '250Hz': 0, '500Hz': 0,
      '1kHz': 0, '2kHz': 0, '4kHz': 0, '8kHz': 0, '16kHz': 0,
    },
  },
  harman: {
    label: 'Harman Target 2024',
    desc: 'Kurva paling populer dengan bass punchy dan vokal jernih alami.',
    bands: {
      '31Hz': 3.5, '62Hz': 2.5, '125Hz': 0.5, '250Hz': -1.0, '500Hz': -1.5,
      '1kHz': 0.0, '2kHz': 1.0, '4kHz': 2.0, '8kHz': 3.0, '16kHz': 0.5,
    },
  },
  audiophile: {
    label: 'Acoustic Audiophile',
    desc: 'Pemisahan instrumen akustik dan staging ruang rekaman luas.',
    bands: {
      '31Hz': 1.0, '62Hz': 0.5, '125Hz': 0.0, '250Hz': 0.0, '500Hz': 0.0,
      '1kHz': 0.5, '2kHz': 1.0, '4kHz': 1.5, '8kHz': 2.0, '16kHz': 1.0,
    },
  },
  bass: {
    label: 'Bass Boost (+6dB)',
    desc: 'Dorongan frekuensi rendah yang kuat dan bertenaga.',
    bands: {
      '31Hz': 6.0, '62Hz': 5.0, '125Hz': 3.5, '250Hz': 1.0, '500Hz': 0.0,
      '1kHz': -0.5, '2kHz': -1.0, '4kHz': 0.0, '8kHz': 0.5, '16kHz': 0.0,
    },
  },
  vocal: {
    label: 'Vocal Presence',
    desc: 'Penonjolan frekuensi tengah agar artikulasi penyanyi lebih terasa.',
    bands: {
      '31Hz': -1.0, '62Hz': -1.0, '125Hz': 0.0, '250Hz': 0.5, '500Hz': 1.5,
      '1kHz': 2.5, '2kHz': 3.0, '4kHz': 2.0, '8kHz': 1.0, '16kHz': 0.5,
    },
  },
};

export const EqualizerView: React.FC<EqualizerViewProps> = ({
  eqState,
  onUpdateEq,
  telemetry,
  isPlaying,
}) => {
  const [showProRack, setShowProRack] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const handleToggleMaster = () => {
    onUpdateEq({
      ...eqState,
      enabled: !eqState.enabled,
    });
  };

  const handlePreampChange = (val: number) => {
    onUpdateEq({
      ...eqState,
      preamp: val,
    });
  };

  const handleBandChange = (freq: EQFrequency, val: number) => {
    const updatedBands = { ...eqState.bands, [freq]: val };
    let newPreamp = eqState.preamp;
    if (eqState.autoPreamp) {
      newPreamp = calculateAutoPreamp(updatedBands);
    }
    onUpdateEq({
      ...eqState,
      bands: updatedBands,
      preamp: newPreamp,
      preset: 'custom',
    });
  };

  const handlePresetSelect = (presetKey: string) => {
    if (PRESETS[presetKey]) {
      const updatedBands = { ...PRESETS[presetKey].bands };
      const newPreamp = eqState.autoPreamp ? calculateAutoPreamp(updatedBands) : eqState.preamp;
      onUpdateEq({
        ...eqState,
        preset: presetKey as any,
        bands: updatedBands,
        preamp: newPreamp,
      });
      setToastMessage(`Preset aktif: ${PRESETS[presetKey].label}`);
      setTimeout(() => setToastMessage(null), 2500);
    }
  };

  const handleResetFlat = () => {
    handlePresetSelect('flat');
  };

  const handleToggleAB = () => {
    const nextMode = eqState.abMode === 'A' ? 'B' : 'A';
    onUpdateEq({
      ...eqState,
      abMode: nextMode,
    });
  };

  // SVG Curve calculations
  const gainToY = (gain: number) => {
    const clamped = Math.max(-12, Math.min(12, gain));
    return 120 - (clamped / 12) * 100;
  };

  const bandPoints = BANDS.map((b, i) => {
    const x = 50 + i * 100;
    const gain = eqState.abMode === 'B' || !eqState.enabled ? 0 : eqState.bands[b.name] || 0;
    const y = gainToY(gain);
    return { x, y, gain };
  });

  let curvePath = `M 0,${bandPoints[0].y}`;
  for (let i = 0; i < bandPoints.length; i++) {
    const pt = bandPoints[i];
    const prevPt = bandPoints[i - 1] || { x: 0, y: pt.y };
    const cX1 = prevPt.x + (pt.x - prevPt.x) / 2;
    const cY1 = prevPt.y;
    const cX2 = prevPt.x + (pt.x - prevPt.x) / 2;
    const cY2 = pt.y;
    curvePath += ` C ${cX1},${cY1} ${cX2},${cY2} ${pt.x},${pt.y}`;
  }
  curvePath += ` L 1000,${bandPoints[bandPoints.length - 1].y}`;

  const freqData = telemetry.frequencyData;
  let energyAreaPath = 'M 0,240';
  if (isPlaying && freqData && freqData.length > 0) {
    for (let i = 0; i <= 10; i++) {
      const x = i * 100;
      const dataIdx = Math.floor((i / 10) * (freqData.length / 2));
      const val = freqData[dataIdx] || 0;
      const energyY = 240 - (val / 255) * 110;
      energyAreaPath += ` L ${x},${energyY}`;
    }
    energyAreaPath += ' L 1000,240 Z';
  } else {
    energyAreaPath = 'M 0,240 L 0,200 Q 250,180 500,210 T 1000,195 L 1000,240 Z';
  }

  return (
    <div className="flex flex-col w-full pb-8 gap-5 max-w-5xl mx-auto">
      {/* Toast Feedback */}
      {toastMessage && (
        <div className="bg-primary text-on-primary p-3 shadow-md flex items-center justify-between text-xs font-label uppercase border-2 border-primary-container">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary-container text-base">check</span>
            <span>{toastMessage}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="text-surface-dim hover:text-white cursor-pointer">
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      )}

      {/* Main Clean Control Deck: On/Off Switch & Quick Presets */}
      <div className="bg-surface-bright border-2 border-outline p-5 shadow-sm flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b-2 border-outline">
          <div className="flex items-center gap-3">
            <button
              onClick={handleToggleMaster}
              className={`flex items-center gap-2 px-4 py-2 border-2 border-outline font-headline font-bold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-[2px_2px_0px_#1a1a1a] ${
                eqState.enabled
                  ? 'bg-primary-container text-on-primary-container hover:bg-primary hover:text-white'
                  : 'bg-surface text-on-surface-variant'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">
                {eqState.enabled ? 'power_settings_new' : 'power_off'}
              </span>
              <span>{eqState.enabled ? 'Equalizer: Aktif' : 'Equalizer: Dinonaktifkan'}</span>
            </button>

            <span
              className={`px-2 py-1 text-[10px] font-mono font-bold uppercase border border-outline ${
                eqState.enabled ? 'bg-secondary-fixed text-secondary' : 'bg-surface text-tertiary'
              }`}
            >
              {eqState.enabled ? 'Modifikasi Suara Aktif' : 'Bit-Perfect Murni'}
            </span>
          </div>

          {/* A/B Quick Compare & Reset */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleToggleAB}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-surface hover:bg-surface-container border border-outline text-xs font-label font-bold uppercase cursor-pointer shadow-[1px_1px_0px_#1a1a1a]"
            >
              <span className="material-symbols-outlined text-sm text-tertiary">compare</span>
              <span>Mode A/B: {eqState.abMode === 'A' ? 'A (EQ Aktif)' : 'B (Bypass)'}</span>
            </button>
            <button
              onClick={handleResetFlat}
              className="flex items-center gap-1 px-3 py-1.5 bg-surface hover:bg-surface-container border border-outline text-xs font-label font-bold uppercase cursor-pointer shadow-[1px_1px_0px_#1a1a1a]"
            >
              <span className="material-symbols-outlined text-sm">restart_alt</span>
              <span>Reset</span>
            </button>
          </div>
        </div>

        {/* 1-Click Preset Selection Buttons (Very Easy To Use) */}
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-headline font-bold uppercase tracking-wider text-on-surface-variant">
            Pilih Karakter Suara Cepat (1-Klik):
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {Object.entries(PRESETS).map(([key, item]) => {
              const isSelected = eqState.preset === key;
              return (
                <div
                  key={key}
                  onClick={() => handlePresetSelect(key)}
                  className={`p-3 border-2 border-outline cursor-pointer transition-all shadow-[2px_2px_0px_#1a1a1a] flex flex-col justify-between ${
                    isSelected
                      ? 'bg-primary-container text-on-primary-container font-bold'
                      : 'bg-surface hover:bg-surface-container text-on-surface'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-headline font-bold text-xs uppercase">{item.label}</span>
                    {isSelected && (
                      <span className="material-symbols-outlined text-base text-primary">check_circle</span>
                    )}
                  </div>
                  <p className="text-[10px] font-body mt-1 opacity-80 leading-snug">{item.desc}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Quick Preamp Level Slider */}
        <div className="flex flex-wrap items-center justify-between gap-4 p-3 bg-surface border border-outline shadow-sm mt-1">
          <div className="flex items-center gap-3 flex-1 min-w-[240px]">
            <span className="font-label text-xs uppercase font-bold text-on-surface shrink-0">
              Volume Preamp:{' '}
              <strong className="font-mono text-secondary ml-1">
                {eqState.preamp > 0 ? `+${eqState.preamp.toFixed(1)}` : eqState.preamp.toFixed(1)} dB
              </strong>
            </span>
            <input
              type="range"
              min="-12"
              max="12"
              step="0.5"
              value={eqState.preamp}
              onChange={(e) => handlePreampChange(parseFloat(e.target.value))}
              className="w-full accent-primary h-2 bg-surface-container cursor-pointer"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-tertiary font-bold bg-surface-container px-2 py-0.5 border border-outline">
              Perlindungan Clipping Otomatis Aktif
            </span>
          </div>
        </div>

        {/* Toggle Button for Complex 10-Band Pro Parametric Console */}
        <div className="pt-2 flex justify-center">
          <button
            onClick={() => setShowProRack(!showProRack)}
            className="flex items-center gap-2 px-4 py-2 bg-surface hover:bg-primary hover:text-white border-2 border-outline font-headline font-bold text-xs uppercase tracking-wider transition-colors shadow-[2px_2px_0px_#1a1a1a] cursor-pointer"
          >
            <span className="material-symbols-outlined text-base">
              {showProRack ? 'tune' : 'equalizer'}
            </span>
            <span>
              {showProRack
                ? 'Sembunyikan Pengaturan 10-Band Detail'
                : 'Buka Pengaturan 10-Band Detail & Spectrum (Opsional)'}
            </span>
            <span className="material-symbols-outlined text-sm">
              {showProRack ? 'expand_less' : 'expand_more'}
            </span>
          </button>
        </div>
      </div>

      {/* Collapsible Complex 10-Band Pro Parametric Rack & Visualizer */}
      {showProRack && (
        <div className="flex flex-col gap-5 animate-fade-in">
          {/* Dual-Curve Spectrum Analyzer */}
          <div className="bg-surface-bright border-2 border-outline shadow-[4px_4px_0px_#1a1a1a] p-4 flex flex-col">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-outline">
              <span className="font-label font-bold text-xs uppercase tracking-wider text-on-surface">
                Dual-Curve Spectrum Analyzer (FFT 4096-Pt)
              </span>
              <div className="flex items-center gap-3 font-mono text-[10px] text-on-surface-variant">
                <span className="text-tertiary font-bold">● Kurva IIR Target</span>
                <span>• REF: 0 dBFS</span>
              </div>
            </div>

            <div className="w-full h-48 bg-surface-container relative border border-outline overflow-hidden">
              <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 1000 240">
                {/* 0 dB Baseline */}
                <line x1="0" y1="120" x2="1000" y2="120" stroke="#1a1a1a" strokeDasharray="4 4" strokeWidth="1.5" opacity="0.6" />
                <path d={energyAreaPath} fill="#ffcc00" fillOpacity={isPlaying ? 0.35 : 0.15} />
                <path d={curvePath} fill="none" stroke="#0055ff" strokeWidth="3.5" strokeLinecap="round" />
                {bandPoints.map((pt, idx) => (
                  <circle key={idx} cx={pt.x} cy={pt.y} r="4.5" fill="#ffcc00" stroke="#1a1a1a" strokeWidth="2" />
                ))}
              </svg>
            </div>
          </div>

          {/* 10-Band Slider Rack */}
          <div className="bg-surface-container border-2 border-outline shadow-[4px_4px_0px_#1a1a1a] p-4">
            <div className="flex items-center justify-between pb-3 mb-3 border-b-2 border-outline">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">equalizer</span>
                <span className="font-headline font-bold text-xs uppercase tracking-wider">
                  ISO Standard 10-Band Graphic Rack
                </span>
              </div>
              <span className="text-[11px] font-mono text-on-surface-variant">Rentang Gain: ±12.0 dB</span>
            </div>

            <div className="overflow-x-auto pb-2">
              <div className="grid grid-cols-10 gap-2 sm:gap-3 py-2 items-center min-w-[640px]">
                {BANDS.map((band) => {
                  const currentGain = eqState.bands[band.name] || 0;
                  const hasGain = Math.abs(currentGain) > 0.01;
                  return (
                    <div
                      key={band.name}
                      className="band-column flex flex-col items-center bg-surface-bright border border-outline p-2 shadow-[2px_2px_0px_#1a1a1a]"
                    >
                      <span
                        className={`band-readout font-mono text-[11px] font-bold px-1.5 py-0.5 border border-outline mb-2 w-full text-center ${
                          hasGain ? 'bg-primary-container text-on-primary-container' : 'bg-surface-container-high text-on-surface'
                        }`}
                      >
                        {currentGain > 0 ? `+${currentGain.toFixed(1)}` : currentGain.toFixed(1)}
                      </span>

                      <div className="h-44 flex items-center justify-center relative w-full py-1">
                        <input
                          type="range"
                          min="-12"
                          max="12"
                          step="0.5"
                          value={currentGain}
                          onChange={(e) => handleBandChange(band.name, parseFloat(e.target.value))}
                          className="band-slider w-2 h-40 accent-primary bg-surface-container-high border border-outline cursor-pointer appearance-none [writing-mode:vertical-lr] [direction:rtl]"
                          aria-label={`${band.label} band gain`}
                        />
                      </div>

                      <div className="flex flex-col items-center w-full mt-2 pt-1 border-t border-outline">
                        <span className="font-headline font-bold text-xs text-on-surface">{band.label}</span>
                        <span className="font-mono text-[9px] text-on-surface-variant">{band.q}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
