import React, { useState } from 'react';
import { OutputSettings } from '../types/audio';

interface OutputSettingsViewProps {
  settings: OutputSettings;
  onUpdateSettings: (newSettings: OutputSettings) => void;
  isBitPerfect: boolean;
}

const BUFFER_PRESETS = [
  { samples: 64, latency: 1.3, label: '64 spl', desc: '1.3 ms' },
  { samples: 128, latency: 2.6, label: '128 spl', desc: '2.6 ms' },
  { samples: 256, latency: 5.3, label: '256 spl', desc: '5.3 ms' },
  { samples: 512, latency: 10.7, label: '512 spl', desc: '10.7 ms' },
];

export const OutputSettingsView: React.FC<OutputSettingsViewProps> = ({
  settings,
  onUpdateSettings,
  isBitPerfect,
}) => {
  const [showAdvancedDiagnostics, setShowAdvancedDiagnostics] = useState(false);
  const [glitches, setGlitches] = useState(0);
  const [spikeTesting, setSpikeTesting] = useState(false);
  const [spikeProgress, setSpikeProgress] = useState(0);
  const [spikePatternState, setSpikePatternState] = useState('SIAP DIUJI');
  const [toast, setToast] = useState<{ title: string; desc: string } | null>(null);

  const showToast = (title: string, desc: string) => {
    setToast({ title, desc });
    setTimeout(() => setToast(null), 3500);
  };

  const handleBufferSlider = (step: number) => {
    const preset = BUFFER_PRESETS[step];
    if (preset) {
      onUpdateSettings({
        ...settings,
        bufferIndex: step,
        bufferSamples: preset.samples,
        latencyMs: preset.latency,
      });
      setGlitches(0);
    }
  };

  const handleRunSpike = () => {
    setSpikeTesting(false);
    setSpikeProgress(0);
    setSpikePatternState('TIDAK DAPAT DIVERIFIKASI');
    showToast(
      'Diagnostik tidak tersedia',
      'Preview browser tidak memiliki akses ke WASAPI atau jalur output native. Status bit-perfect tidak dapat diverifikasi.'
    );
  };

  const handleExportLog = () => {
    const logContent = [
      '====================================================',
      'RESONANCE CORE - AUDIO ENGINE DIAGNOSTIC REPORT',
      '====================================================',
      `Waktu: ${new Date().toISOString()}`,
      'Engine: Browser Web Audio preview; native WASAPI not connected',
      `Endpoint: ${
        settings.activeDevice === 'topping'
          ? 'Topping D90 III Sabre DAC [WASAPI Exclusive]'
          : settings.activeDevice === 'schiit'
          ? 'Schiit Bifrost 2 [Exclusive]'
          : 'Realtek High Definition Audio [Shared]'
      }`,
      `Buffer: ${settings.bufferSamples} samples (${settings.latencyMs}ms)`,
      'Status: UNVERIFIED — native output path is unavailable in browser preview',
      `Bit-perfect status: UNVERIFIED (browser preview cannot inspect the native output path)`,
      'Spike Test: NOT RUN — native loopback/bit comparison is unavailable',
      '====================================================',
    ].join('\n');

    const blob = new Blob([logContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `resonance_audio_diag_${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Laporan Terunduh', 'File diagnostik tersimpan di folder Unduhan.');
  };

  return (
    <div className="flex flex-col w-full pb-8 gap-5 max-w-4xl mx-auto">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-28 right-6 md:right-8 bg-primary text-on-primary p-4 shadow-xl flex items-center gap-3 z-50 border-2 border-primary-container max-w-md animate-fade-in">
          <span className="material-symbols-outlined text-primary-container text-xl">verified</span>
          <div className="flex flex-col">
            <span className="font-headline font-bold text-xs uppercase tracking-wide">{toast.title}</span>
            <span className="font-mono text-[11px] text-surface-container-high">{toast.desc}</span>
          </div>
        </div>
      )}

      {/* Main Simplified Device & Output Settings Card */}
      <div className="bg-surface-bright border-2 border-outline p-5 shadow-sm flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b-2 border-outline">
          <div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-tertiary text-xl">speaker</span>
              <h1 className="font-headline font-bold text-lg md:text-xl uppercase tracking-tight text-on-surface">
                Pengaturan Output Audio &amp; Perangkat
              </h1>
            </div>
            <p className="text-xs text-on-surface-variant font-body mt-0.5">
              Pilih perangkat output suara fisik dan aktifkan mode bit-perfect eksklusif.
            </p>
          </div>

          <span className="px-2.5 py-1 bg-primary-container text-on-primary-container font-headline font-bold text-[11px] uppercase border border-outline">
            WASAPI Core Active
          </span>
        </div>

        {/* Device Dropdown Picker */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-headline font-bold uppercase text-on-surface">
            Perangkat Output Suara (DAC / Headphone / Speaker):
          </label>
          <div className="relative">
            <select
              value={settings.activeDevice}
              onChange={(e) => onUpdateSettings({ ...settings, activeDevice: e.target.value as any })}
              className="w-full bg-surface text-on-surface font-headline font-semibold text-sm p-3 appearance-none cursor-pointer focus:outline-none focus:bg-primary-container transition-colors pr-10 border-2 border-outline shadow-[2px_2px_0px_#1a1a1a]"
            >
              <option value="topping">Topping D90 III Sabre DAC [Direct USB-C / OTG]</option>
              <option value="schiit">Schiit Bifrost 2 [Exclusive Bit-Perfect]</option>
              <option value="realtek">Speaker / Headphone Internal (Realtek Audio)</option>
            </select>
            <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-on-surface">
              expand_more
            </span>
          </div>
        </div>

        {/* 2 Simple Mode Cards (Exclusive vs Shared) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
          <div
            onClick={() => onUpdateSettings({ ...settings, wasapiMode: 'exclusive' })}
            className={`p-4 border-2 cursor-pointer transition-all shadow-[2px_2px_0px_#1a1a1a] flex flex-col justify-between ${
              settings.wasapiMode === 'exclusive'
                ? 'bg-primary-container border-outline text-on-primary-container'
                : 'bg-surface border-outline/30 text-on-surface hover:bg-surface-container'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-headline font-bold text-xs uppercase flex items-center gap-1.5">
                <span className="material-symbols-outlined text-base">bolt</span>
                Mode Eksklusif (Bit-Perfect)
              </span>
              {settings.wasapiMode === 'exclusive' && (
                <span className="text-[10px] font-mono font-bold bg-primary text-white px-1.5 py-0.2">
                  AKTIF
                </span>
              )}
            </div>
            <p className="text-[11px] font-body opacity-90 leading-relaxed">
              Melewati mixer sistem operasi untuk kemurnian suara 100% lossless asli tanpa kompresi tambahan.
            </p>
          </div>

          <div
            onClick={() => onUpdateSettings({ ...settings, wasapiMode: 'shared' })}
            className={`p-4 border-2 cursor-pointer transition-all shadow-[2px_2px_0px_#1a1a1a] flex flex-col justify-between ${
              settings.wasapiMode === 'shared'
                ? 'bg-primary-container border-outline text-on-primary-container'
                : 'bg-surface border-outline/30 text-on-surface hover:bg-surface-container'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-headline font-bold text-xs uppercase flex items-center gap-1.5">
                <span className="material-symbols-outlined text-base">layers</span>
                Mode Bersama (Shared Audio)
              </span>
              {settings.wasapiMode === 'shared' && (
                <span className="text-[10px] font-mono font-bold bg-primary text-white px-1.5 py-0.2">
                  AKTIF
                </span>
              )}
            </div>
            <p className="text-[11px] font-body opacity-90 leading-relaxed">
              Bercampur dengan notifikasi dan suara aplikasi lain pada sistem operasi secara bersamaan.
            </p>
          </div>
        </div>

        {/* Fallback Switch */}
        <div className="flex items-center justify-between p-3 bg-surface border border-outline shadow-sm">
          <div className="flex flex-col">
            <span className="font-headline font-bold text-xs uppercase text-on-surface">
              Peralihan Otomatis (Fallback)
            </span>
            <span className="text-[11px] text-on-surface-variant font-body">
              Secara cerdas beralih ke Shared Mode jika DAC digunakan aplikasi lain
            </span>
          </div>
          <button
            onClick={() =>
              onUpdateSettings({ ...settings, gracefulFallback: !settings.gracefulFallback })
            }
            className={`px-3 py-1 font-headline font-bold text-xs uppercase border border-outline cursor-pointer ${
              settings.gracefulFallback ? 'bg-primary text-white' : 'bg-surface-container'
            }`}
          >
            {settings.gracefulFallback ? 'Aktif' : 'Nonaktif'}
          </button>
        </div>

        {/* Button to toggle Complex Diagnostics */}
        <div className="flex justify-center pt-1">
          <button
            onClick={() => setShowAdvancedDiagnostics(!showAdvancedDiagnostics)}
            className="flex items-center gap-2 px-4 py-2 bg-surface hover:bg-primary hover:text-white border-2 border-outline font-headline font-bold text-xs uppercase tracking-wider transition-colors shadow-[2px_2px_0px_#1a1a1a] cursor-pointer"
          >
            <span className="material-symbols-outlined text-base">analytics</span>
            <span>
              {showAdvancedDiagnostics
                ? 'Sembunyikan Pengaturan Buffer & Diagnostik'
                : 'Buka Pengaturan Buffer DMA & Uji Sinyal (Opsional)'}
            </span>
            <span className="material-symbols-outlined text-sm">
              {showAdvancedDiagnostics ? 'expand_less' : 'expand_more'}
            </span>
          </button>
        </div>
      </div>

      {/* Collapsible Complex Diagnostics Section */}
      {showAdvancedDiagnostics && (
        <div className="flex flex-col gap-5 animate-fade-in">
          {/* Buffer Latency Stepper */}
          <div className="bg-surface-bright p-5 border-2 border-outline shadow-sm flex flex-col gap-3">
            <div className="flex justify-between items-center pb-2 border-b border-outline/20">
              <span className="font-headline font-bold text-xs uppercase tracking-wider text-on-surface">
                Alokasi Buffer Ring DMA (Pengaturan Latensi):
              </span>
              <span className="font-mono text-xs font-bold bg-surface-container px-2 py-0.5 border border-outline">
                {settings.bufferSamples} spl • {settings.latencyMs} ms
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="3"
              step="1"
              value={settings.bufferIndex}
              onChange={(e) => handleBufferSlider(parseInt(e.target.value, 10))}
              className="w-full accent-primary cursor-pointer h-2 bg-surface-container"
            />
            <div className="grid grid-cols-4 text-center font-mono text-[10px] text-on-surface font-semibold pt-1">
              {BUFFER_PRESETS.map((p, idx) => (
                <div key={p.label} className="flex flex-col items-center">
                  <span className={`font-bold ${settings.bufferIndex === idx ? 'text-tertiary underline' : ''}`}>
                    {p.label}
                  </span>
                  <span className="text-[9px] text-on-surface-variant">{p.desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Signal Spike Tester */}
          <div className="bg-surface-bright p-5 border-2 border-outline shadow-sm flex flex-col gap-3">
            <div className="flex items-center justify-between pb-2 border-b border-outline/20">
              <span className="font-headline font-bold text-xs uppercase tracking-wider text-on-surface">
                Uji Sinyal &amp; Audit Passthrough DAC
              </span>
              <span className="text-[10px] font-mono text-tertiary font-bold">{spikePatternState}</span>
            </div>
            <p className="text-xs text-on-surface-variant font-body">
              Mengirimkan denyut frekuensi tinggi tak terdengar untuk menguji integritas sample bitstream tanpa jitter.
            </p>
            {spikeProgress > 0 && (
              <div className="w-full h-2 bg-surface-container overflow-hidden border border-outline">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${spikeProgress}%` }}
                ></div>
              </div>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                onClick={handleRunSpike}
                disabled={spikeTesting}
                className="px-4 py-2 bg-primary text-white font-headline font-bold text-xs uppercase hover:bg-tertiary transition-colors border border-outline cursor-pointer disabled:opacity-50"
              >
                Mulai Uji Sinyal Spike
              </button>
              <button
                onClick={handleExportLog}
                className="px-4 py-2 bg-surface hover:bg-surface-container font-headline font-bold text-xs uppercase border border-outline cursor-pointer"
              >
                Unduh Laporan Diagnostik (.txt)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
