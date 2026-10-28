import type { EqualizerState, EQFrequency, Track } from '../types/audio';

export interface AudioTelemetry {
  currentTimeMs: number;
  durationMs: number;
  rmsLeft: number;
  rmsRight: number;
  peakLeft: number;
  peakRight: number;
  frequencyData: Uint8Array;
}

const EQ_CENTERS: Record<EQFrequency, number> = {
  '31Hz': 31,
  '62Hz': 62,
  '125Hz': 125,
  '250Hz': 250,
  '500Hz': 500,
  '1kHz': 1000,
  '2kHz': 2000,
  '4kHz': 4000,
  '8kHz': 8000,
  '16kHz': 16000,
};

const DEFAULT_EQ: EqualizerState = {
  enabled: true,
  preamp: -1.5,
  bands: {
    '31Hz': 3.5,
    '62Hz': 2.5,
    '125Hz': 0.5,
    '250Hz': -1,
    '500Hz': -1.5,
    '1kHz': 0,
    '2kHz': 1,
    '4kHz': 2,
    '8kHz': 3,
    '16kHz': 0.5,
  },
  preset: 'harman',
  abMode: 'A',
  autoPreamp: true,
};

function linearToDb(value: number, floor = -60): number {
  if (!Number.isFinite(value) || value <= 0) return floor;
  return Math.max(floor, 20 * Math.log10(value));
}

/**
 * Browser preview audio engine only.
 *
 * This uses HTMLAudioElement + Web Audio and is NOT a native WASAPI,
 * Android, or iOS engine. A track must be explicitly registered with a
 * browser-playable URL (normally an object URL from a user-selected File).
 * Local filesystem paths are not browser-playable URLs.
 */
class AudioEngine {
  private ctx: AudioContext | null = null;
  private audio: HTMLAudioElement | null = null;
  private mediaSourceNode: MediaElementAudioSourceNode | null = null;
  private preampNode: GainNode | null = null;
  private filterNodes = new Map<EQFrequency, BiquadFilterNode>();
  private analyserNode: AnalyserNode | null = null;
  private splitter: ChannelSplitterNode | null = null;
  private leftAnalyser: AnalyserNode | null = null;
  private rightAnalyser: AnalyserNode | null = null;
  private masterGain: GainNode | null = null;
  private animationFrameId: number | null = null;
  private isPlaying = false;
  private currentTrack: Track | null = null;
  private activeSource = '';
  private pendingSeekMs: number | null = null;
  private volume = 0.85;
  private sourceOverrides = new Map<string, string>();
  private telemetryListeners = new Set<(telemetry: AudioTelemetry) => void>();
  private trackEndListeners = new Set<() => void>();
  private eqState: EqualizerState = { ...DEFAULT_EQ, bands: { ...DEFAULT_EQ.bands } };

  public registerTrackSource(trackId: string, sourceUrl: string): void {
    const source = sourceUrl.trim();
    if (!source) throw new Error('URL audio tidak boleh kosong.');
    const previous = this.sourceOverrides.get(trackId);
    if (previous && previous !== source && previous.startsWith('blob:')) URL.revokeObjectURL(previous);
    this.sourceOverrides.set(trackId, source);
  }

  public unregisterTrackSource(trackId: string): void {
    const source = this.sourceOverrides.get(trackId);
    if (source?.startsWith('blob:')) URL.revokeObjectURL(source);
    this.sourceOverrides.delete(trackId);
  }

  public async playTrack(track: Track, startFromMs = 0): Promise<void> {
    const source = this.sourceOverrides.get(track.id);
    if (!source) {
      throw new Error(
        'Sumber audio belum terdaftar. Pilih file audio lokal terlebih dahulu; path filesystem tidak dapat diputar langsung dari browser.'
      );
    }

    this.initContext();
    const audio = this.audio!;
    const sourceChanged = source !== this.activeSource;
    if (sourceChanged) audio.pause();

    this.currentTrack = track;
    this.pendingSeekMs = this.clampPosition(startFromMs, track.duration * 1000);

    if (sourceChanged) {
      this.activeSource = source;
      audio.src = source;
      audio.load();
      await this.waitForMetadata();
    } else if (audio.readyState < HTMLMediaElement.HAVE_METADATA) {
      await this.waitForMetadata();
    }

    if (this.ctx?.state === 'suspended') await this.ctx.resume();

    const durationMs = this.getDurationMs() || track.duration * 1000;
    const seekMs = this.clampPosition(startFromMs, durationMs);
    this.pendingSeekMs = seekMs;
    try {
      audio.currentTime = seekMs / 1000;
      this.pendingSeekMs = null;
    } catch {
      // The loadedmetadata handler will retry a pending seek.
    }

    await audio.play();
    this.isPlaying = true;
    this.emitTelemetry();
    this.startTelemetryLoop();
  }

  public pause(): void {
    if (!this.audio || this.audio.paused) {
      this.isPlaying = false;
      this.stopTelemetryLoop();
      this.emitTelemetry();
      return;
    }
    this.audio.pause();
    this.isPlaying = false;
    this.stopTelemetryLoop();
    this.emitTelemetry();
  }

  public resume(): void {
    if (!this.currentTrack) return;
    void this.playTrack(this.currentTrack, this.getCurrentPositionMs()).catch((error: unknown) => {
      console.error('[AudioEngine] Resume failed:', error);
    });
  }

  public seek(toMs: number): void {
    const durationMs = this.getDurationMs() || (this.currentTrack?.duration ?? 0) * 1000;
    const targetMs = this.clampPosition(toMs, durationMs);
    this.pendingSeekMs = targetMs;
    if (this.audio && this.audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
      try {
        this.audio.currentTime = targetMs / 1000;
        this.pendingSeekMs = null;
      } catch {
        // Keep the pending seek until metadata becomes available.
      }
    }
    this.emitTelemetry();
  }

  public setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, Number.isFinite(volume) ? volume : 0.85));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.015);
    } else if (this.audio) {
      this.audio.volume = this.volume;
    }
  }

  public setEqualizer(state: EqualizerState): void {
    this.eqState = { ...state, bands: { ...state.bands } };
    this.applyEq();
  }

  public subscribeTelemetry(listener: (telemetry: AudioTelemetry) => void): () => void {
    this.telemetryListeners.add(listener);
    listener(this.createTelemetry());
    return () => this.telemetryListeners.delete(listener);
  }

  public subscribeTrackEnd(listener: () => void): () => void {
    this.trackEndListeners.add(listener);
    return () => this.trackEndListeners.delete(listener);
  }

  public isCurrentlyPlaying(): boolean {
    return this.isPlaying && Boolean(this.audio && !this.audio.paused);
  }

  public getCurrentPositionMs(): number {
    if (this.audio && Number.isFinite(this.audio.currentTime)) return this.audio.currentTime * 1000;
    return 0;
  }

  private initContext(): void {
    if (this.ctx && this.audio) return;
    const AudioContextConstructor = window.AudioContext;
    if (!AudioContextConstructor) throw new Error('Web Audio API tidak didukung browser ini.');

    this.ctx = new AudioContextConstructor();
    this.audio = new Audio();
    this.audio.preload = 'metadata';
    this.audio.crossOrigin = 'anonymous';
    this.audio.volume = 1;

    this.mediaSourceNode = this.ctx.createMediaElementSource(this.audio);
    this.preampNode = this.ctx.createGain();
    this.masterGain = this.ctx.createGain();
    this.analyserNode = this.ctx.createAnalyser();
    this.analyserNode.fftSize = 256;
    this.splitter = this.ctx.createChannelSplitter(2);
    this.leftAnalyser = this.ctx.createAnalyser();
    this.rightAnalyser = this.ctx.createAnalyser();
    this.leftAnalyser.fftSize = 2048;
    this.rightAnalyser.fftSize = 2048;

    let previous: AudioNode = this.mediaSourceNode;
    for (const frequency of Object.keys(EQ_CENTERS) as EQFrequency[]) {
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'peaking';
      filter.frequency.value = EQ_CENTERS[frequency];
      filter.Q.value = 1;
      this.filterNodes.set(frequency, filter);
      previous.connect(filter);
      previous = filter;
    }

    previous.connect(this.preampNode);
    this.preampNode.connect(this.masterGain);
    this.masterGain.connect(this.analyserNode);
    this.analyserNode.connect(this.ctx.destination);
    this.masterGain.connect(this.splitter);
    this.splitter.connect(this.leftAnalyser, 0);
    this.splitter.connect(this.rightAnalyser, 1);
    this.applyEq();
    this.masterGain.gain.value = this.volume;

    this.audio.addEventListener('ended', this.handleEnded);
    this.audio.addEventListener('loadedmetadata', this.handleLoadedMetadata);
    this.audio.addEventListener('error', this.handleAudioError);
  }

  private readonly handleEnded = (): void => {
    this.isPlaying = false;
    this.stopTelemetryLoop();
    this.emitTelemetry();
    this.trackEndListeners.forEach((listener) => listener());
  };

  private readonly handleLoadedMetadata = (): void => {
    if (this.pendingSeekMs === null || !this.audio) return;
    try {
      this.audio.currentTime = this.pendingSeekMs / 1000;
      this.pendingSeekMs = null;
    } catch {
      // A later seek or metadata event can retry.
    }
    this.emitTelemetry();
  };

  private readonly handleAudioError = (): void => {
    console.error('[AudioEngine]', this.getMediaErrorMessage());
    this.isPlaying = false;
    this.stopTelemetryLoop();
    this.emitTelemetry();
  };

  private waitForMetadata(): Promise<void> {
    const audio = this.audio;
    if (!audio) return Promise.reject(new Error('Audio engine belum diinisialisasi.'));
    if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) return Promise.resolve();

    return new Promise((resolve, reject) => {
      const cleanup = () => {
        audio.removeEventListener('loadedmetadata', onLoaded);
        audio.removeEventListener('error', onError);
      };
      const onLoaded = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error(this.getMediaErrorMessage()));
      };
      audio.addEventListener('loadedmetadata', onLoaded, { once: true });
      audio.addEventListener('error', onError, { once: true });
    });
  }

  private getMediaErrorMessage(): string {
    const code = this.audio?.error?.code;
    const details: Record<number, string> = {
      1: 'Pemuatan audio dibatalkan.',
      2: 'Terjadi kesalahan saat memuat sumber audio.',
      3: 'Audio gagal didekode; file mungkin rusak atau codec tidak didukung browser.',
      4: 'Format atau sumber audio tidak didukung browser.',
    };
    return details[code ?? 0] ?? 'Audio gagal dimuat. Periksa file dan dukungan codec browser.';
  }

  private getDurationMs(): number {
    if (this.audio && Number.isFinite(this.audio.duration) && this.audio.duration > 0) {
      return this.audio.duration * 1000;
    }
    return (this.currentTrack?.duration ?? 0) * 1000;
  }

  private clampPosition(positionMs: number, durationMs: number): number {
    const safePosition = Number.isFinite(positionMs) ? Math.max(0, positionMs) : 0;
    if (!Number.isFinite(durationMs) || durationMs <= 0) return safePosition;
    return Math.min(safePosition, durationMs);
  }

  private applyEq(): void {
    if (!this.ctx || !this.preampNode) return;
    const bypass = !this.eqState.enabled || this.eqState.abMode === 'B';
    const preampDb = bypass ? 0 : this.eqState.preamp;
    this.preampNode.gain.setTargetAtTime(Math.pow(10, preampDb / 20), this.ctx.currentTime, 0.05);
    this.filterNodes.forEach((node, frequency) => {
      node.gain.setTargetAtTime(bypass ? 0 : (this.eqState.bands[frequency] ?? 0), this.ctx!.currentTime, 0.05);
    });
  }

  private startTelemetryLoop(): void {
    this.stopTelemetryLoop();
    const loop = () => {
      this.emitTelemetry();
      if (this.isPlaying && this.audio && !this.audio.paused) {
        this.animationFrameId = window.requestAnimationFrame(loop);
      } else {
        this.animationFrameId = null;
      }
    };
    this.animationFrameId = window.requestAnimationFrame(loop);
  }

  private stopTelemetryLoop(): void {
    if (this.animationFrameId !== null) {
      window.cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private measureLevel(analyser: AnalyserNode | null): { rmsDb: number; peakDb: number } {
    if (!analyser) return { rmsDb: -60, peakDb: -60 };
    const samples = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(samples);
    let sumSquares = 0;
    let peak = 0;
    for (const sample of samples) {
      const absolute = Math.abs(sample);
      sumSquares += sample * sample;
      if (absolute > peak) peak = absolute;
    }
    return {
      rmsDb: linearToDb(Math.sqrt(sumSquares / Math.max(1, samples.length))),
      peakDb: linearToDb(peak),
    };
  }

  private createTelemetry(): AudioTelemetry {
    const frequencyData = this.analyserNode
      ? new Uint8Array(this.analyserNode.frequencyBinCount)
      : new Uint8Array(128);
    if (this.analyserNode) this.analyserNode.getByteFrequencyData(frequencyData);
    const left = this.measureLevel(this.leftAnalyser);
    const right = this.measureLevel(this.rightAnalyser);
    return {
      currentTimeMs: this.getCurrentPositionMs(),
      durationMs: this.getDurationMs(),
      rmsLeft: left.rmsDb,
      rmsRight: right.rmsDb,
      peakLeft: left.peakDb,
      peakRight: right.peakDb,
      frequencyData,
    };
  }

  private emitTelemetry(): void {
    const telemetry = this.createTelemetry();
    this.telemetryListeners.forEach((listener) => listener(telemetry));
  }
}

export const audioEngine = new AudioEngine();
