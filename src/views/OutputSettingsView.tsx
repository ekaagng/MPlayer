import React, { useState } from 'react';
import { OutputSettings } from '../types/audio';

interface OutputSettingsViewProps {
  settings: OutputSettings;
  onUpdateSettings: (newSettings: OutputSettings) => void;
  isNativeRuntime?: boolean;
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
  isNativeRuntime = false,
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
      isNativeRuntime ? 'Backend native memakai output default sistem. WASAPI exclusive, loopback, dan verifikasi bit-perfect belum tersedia.' : 'Preview browser tidak memiliki akses ke jalur output native. Status bit-perfect tidak dapat diverifikasi.'
    );
  };

  const handleExportLog = () => {
    const logContent = [
      '====================================================',
      'MPLAYER - AUDIO ENGINE DIAGNOSTIC REPORT',
      '====================================================',
      `Waktu: ${new Date().toISOString()}`,
      `Engine: ${isNativeRuntime ? 'Rodio/CPAL native playback through default OS output' : 'Browser Web Audio preview'}`, 
      `Preferred device setting: ${settings.activeDevice} (preference only; not applied to the active audio device)`, 
      `Requested buffer: ${settings.bufferSamples} samples (${settings.latencyMs}ms; preference only)`,
      isNativeRuntime ? 'Status: native playback backend present; device-specific and exclusive output not implemented' : 'Status: UNVERIFIED — native output path is unavailable in browser preview',
      'Bit-perfect status: UNVERIFIED',
      'Spike Test: NOT RUN — loopback capture and bit comparison are unavailable',
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
        <div className="fixed bottom-4 left-3 right-3 sm:bottom-6 sm:left-auto sm:right-6 bg-primary text-on-primary p-3 sm:p-4 shadow-xl flex items-center gap-3 z-50 border border-primary-container sm:max-w-md animate-fade-in">
          <span className="material-symbols-outlined text-primary-container text-xl">verified</span>
          <div className="flex flex-col">
            <span className="font-headline font-bold text-xs uppercase tracking-wide">{toast.title}</span>
            <span className="font-mono text-[11px] text-surface-container-high">{toast.desc}</span>
          </div>
        </div>
      )}

      {/* Main Simplified Device & Output Settings Card */}
      <div className="min-w-0 rounded-2xl border border-outline/15 bg-surface-bright p-3 shadow-sm flex flex-col gap-4 sm:gap-5 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b-2 border-outline">
          <div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-tertiary text-xl">speaker</span>
              <h1 className="font-headline font-bold text-lg md:text-xl uppercase tracking-tight text-on-surface">
                Pengaturan Output Audio &amp; Perangkat
              </h1>
            </div>
            <p className="text-xs text-on-surface-variant font-body mt-0.5">
              {isNativeRuntime ? 'Backend native saat ini memakai output default sistem. Pemilihan device, mode eksklusif, pengaturan buffer, dan audit loopback belum diimplementasikan.' : 'Preferensi ini hanya untuk rancangan antarmuka; preview browser tidak mengendalikan output hardware native.'}
            </p>
          </div>

          <span className="px-2.5 py-1 bg-primary-container text-on-primary-container font-headline font-bold text-[11px] uppercase border border-outline">
            {isNativeRuntime ? 'NATIVE DEFAULT OUTPUT · ADVANCED PATH UNVERIFIED' : 'PREVIEW · OUTPUT NATIVE UNVERIFIED'}
          </span>
        </div>

        {/* Device Dropdown Picker */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-headline font-bold uppercase text-on-surface">
            Preferensi perangkat output (belum diterapkan ke hardware):
          </label>
          <div className="relative">
            <select
              value={settings.activeDevice}
              disabled
              onChange={(e) => onUpdateSettings({ ...settings, activeDevice: e.target.value as any })}
              className="w-full bg-surface text-on-surface font-headline font-semibold text-sm p-3 appearance-none cursor-pointer focus:outline-none focus:bg-primary-container transition-colors pr-10 border-2 border-outline shadow-[2px_2px_0px_#1a1a1a]"
            >
              <option value="topping">Topping D90 III Sabre DAC [Direct USB-C / OTG]</option>
              <option value="schiit">Schiit Bifrost 2 [Preferensi saja]</option>
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
            aria-disabled="true"
            className={`p-4 border-2 cursor-not-allowed opacity-65 transition-all shadow-[2px_2px_0px_#1a1a1a] flex flex-col justify-between ${
              settings.wasapiMode === 'exclusive'
                ? 'bg-primary-container border-outline text-on-primary-container'
                : 'bg-surface border-outline/30 text-on-surface hover:bg-surface-container'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-headline font-bold text-xs uppercase flex items-center gap-1.5">
                <span className="material-symbols-outlined text-base">bolt</span>
                Mode eksklusif (belum diimplementasikan)
              </span>
              {settings.wasapiMode === 'exclusive' && (
                <span className="text-[10px] font-mono font-bold bg-primary text-white px-1.5 py-0.2">
                  TERPILIH
                </span>
              )}
            </div>
            <p className="text-[11px] font-body opacity-90 leading-relaxed">
              Kontrol ini belum terhubung ke backend audio. Output eksklusif harus diimplementasikan menggunakan API audio platform.
            </p>
          </div>

          <div
            aria-disabled="true"
            className={`p-4 border-2 cursor-pointer transition-all shadow-[2px_2px_0px_#1a1a1a] flex flex-col justify-between ${
              settings.wasapiMode === 'shared'
                ? 'bg-primary-container border-outline text-on-primary-container'
                : 'bg-surface border-outline/30 text-on-surface hover:bg-surface-container'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-headline font-bold text-xs uppercase flex items-center gap-1.5">
                <span className="material-symbols-outlined text-base">layers</span>
                Mode bersama (belum diimplementasikan)
              </span>
              {settings.wasapiMode === 'shared' && (
                <span className="text-[10px] font-mono font-bold bg-primary text-white px-1.5 py-0.2">
                  AKTIF
                </span>
              )}
            </div>
            <p className="text-[11px] font-body opacity-90 leading-relaxed">
              Belum terhubung ke backend. Output eksklusif memerlukan implementasi API khusus platform.
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
              Fallback otomatis belum diimplementasikan pada backend native maupun preview.
            </span>
          </div>
          <button
            disabled
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
            className="flex w-full flex-wrap items-center justify-center gap-2 rounded-xl border border-outline/15 bg-surface px-3 py-3 text-center text-xs font-bold uppercase tracking-wide transition-colors hover:bg-surface-container sm:px-4"
          >
            <span className="material-symbols-outlined text-base">analytics</span>
            <span>
              {showAdvancedDiagnostics
                ? 'Sembunyikan Pengaturan Buffer & Diagnostik'
                : 'Audit Sinyal DAC & Pengaturan Lanjutan'}
            </span>
            <span className="material-symbols-outlined text-sm">
              {showAdvancedDiagnostics ? 'expand_less' : 'expand_more'}
            </span>
          </button>
        </div>
      </div>

      {/* Collapsible Complex Diagnostics Section */}
      {showAdvancedDiagnostics && (
        <div className="flex min-w-0 flex-col gap-4 animate-fade-in sm:gap-5">
          {/* Buffer Latency Stepper */}
          <div className="min-w-0 rounded-2xl border border-outline/15 bg-surface-bright p-3 shadow-sm flex flex-col gap-3 sm:p-5">
            <div className="flex justify-between items-center pb-2 border-b border-outline/20">
              <span className="font-headline font-bold text-xs uppercase tracking-wider text-on-surface">
                Preferensi buffer (belum diterapkan ke output native):
              </span>
              <span className="font-mono text-xs font-bold bg-surface-container px-2 py-0.5 border border-outline">
                {settings.bufferSamples} spl • {settings.latencyMs} ms
              </span>
            </div>
            <input
              type="range"
              disabled
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
                Status Jalur Audio &amp; Audit Output
              </span>
              <span className="text-[10px] font-mono text-tertiary font-bold">{spikePatternState}</span>
            </div>
            <p className="text-xs text-on-surface-variant font-body">
              {isNativeRuntime ? 'Backend playback native tersedia, tetapi pemilihan perangkat, WASAPI exclusive, loopback capture, dan uji bit-perfect belum diimplementasikan. Status jalur sinyal tidak dapat diverifikasi.' : 'Preview browser tidak dapat mengirim sinyal uji ke DAC native. Hasil audit tidak dapat diverifikasi pada preview web.'}
            </p>
            {spikeProgress > 0 && (
              <div className="w-full h-2 bg-surface-container overflow-hidden border border-outline">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${spikeProgress}%` }}
                ></div>
              </div>
            )}
            <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:flex-wrap">
              <button
                onClick={handleRunSpike}
                disabled={spikeTesting}
                className="flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 py-2 text-center text-xs font-bold uppercase text-white transition-colors hover:bg-tertiary disabled:opacity-50 sm:flex-none"
              >
                Periksa Status Jalur Audio
              </button>
              <button
                onClick={handleExportLog}
                className="flex min-h-11 items-center justify-center rounded-lg border border-outline/15 bg-surface px-4 py-2 text-center text-xs font-bold uppercase hover:bg-surface-container sm:flex-none"
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
