 * provide a URL through registerTrackSource(), or use a native desktop backend.
 */
class AudioEngine {
  private ctx: AudioContext | null = null;
  private audio: HTMLAudioElement | null = null;
  private mediaSourceNode: MediaElementAudioSourceNode | null = null;

  private preampNode: GainNode | null = null;
  private filterNodes: Map<EQFrequency, BiquadFilterNode> = new Map();
  private limiterNode: DynamicsCompressorNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private channelSplitter: ChannelSplitterNode | null = null;
  private leftAnalyser: AnalyserNode | null = null;
  private rightAnalyser: AnalyserNode | null = null;
  private leftMeterSilence: GainNode | null = null;
  private rightMeterSilence: GainNode | null = null;
  private masterGain: GainNode | null = null;

  private animationFrameId: number | null = null;
  private isPlaying = false;
  private playbackOffsetMs = 0;
  private currentTrack: Track | null = null;
  private activeSource = '';
  private pendingSeekMs: number | null = null;
  private volume = 0.85;

  private sourceOverrides: Map<string, string> = new Map();
  private telemetryListeners: Set<(telemetry: AudioTelemetry) => void> = new Set();
  private trackEndListeners: Set<() => void> = new Set();

  private eqState: EqualizerState = {
    enabled: true,
    preamp: -1.5,
    bands: {
      '31Hz': 3.5,
      '62Hz': 2.5,
      '125Hz': 0.5,
      '250Hz': -1.0,
      '500Hz': -1.5,
      '1kHz': 0.0,
      '2kHz': 1.0,
      '4kHz': 2.0,
      '8kHz': 3.0,
      '16kHz': 0.5,
    },
    preset: 'harman',
    abMode: 'A',
    autoPreamp: true,
  };

  /** Register a browser-playable source for a track (for example, a Blob URL). */
  public registerTrackSource(trackId: string, sourceUrl: string): void {
    const source = sourceUrl.trim();
    if (!source) throw new Error('URL audio tidak boleh kosong.');

    const previous = this.sourceOverrides.get(trackId);
    if (previous && previous !== source && previous.startsWith('blob:')) {
      URL.revokeObjectURL(previous);
    }
    this.sourceOverrides.set(trackId, source);
  }

       const source = this.resolveTrackSource(track);
    this.initContext();

    const audio = this.audio!;
    const sourceChanged = source !== this.activeSource;

    // Pause the previous source before changing the active track.
    if (sourceChanged) audio.pause();

    this.currentTrack = track;
    this.playbackOffsetMs = this.clampPosition(startFromMs, track.duration * 1000);
    this.pendingSeekMs = this.playbackOffsetMs;

    if (sourceChanged) {
      this.activeSource = source;
      audio.src = source;
      audio.load();
      await this.waitForMetadata();
    } else if (audio.readyState < HTMLMediaElement.HAVE_METADATA) {
      await this.waitForMetadata();
    }

    if (this.ctx?.state === 'suspended') await this.ctx.resume();

    const durationMs = this.getDurationMs();
    const seekMs = this.clampPosition(startFromMs, durationMs || track.duration * 1000);
    this.pendingSeekMs = seekMs;
    try {
      audio.currentTime = seekMs / 1000;
      this.pendingSeekMs = null;
    } catch {
      // Some media backends do not allow seeking until metadata is available.
      // Keep the pending seek; the loadedmetadata handler applies it when possible.
    }

    await audio.play();
    this.isPlaying = true;
    this.playbackOffsetMs = audio.currentTime * 1000;
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
    this.playbackOffsetMs = this.audio.currentTime * 1000;
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
    this.playbackOffsetMs = targetMs;
    this.pendingSeekMs = targetMs;

    if (this.audio && this.currentTrack && this.audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
      try {
        this.audio.currentTime = targetMs / 1000;
        this.pendingSeekMs = null;
      } catch {
        // Keep pendingSeekMs; it will be retried after metadata becomes available.
      }
    }

    this.emitTelemetry();
  }

      audio.addEventListener('error', onError, { once: true });
    });
  }

  private getMediaErrorMessage(): string {
    const code = this.audio?.error?.code;
    const details: Record<number, string> = {
      1: 'Pemuatan audio dibatalkan.',
      2: 'Terjadi kesalahan jaringan saat memuat audio.',
      3: 'Audio gagal didekode; file mungkin rusak atau codec tidak didukung browser.',
      4: 'Format atau sumber audio tidak didukung browser.',
    };
    return details[code ?? 0] ?? 'Audio gagal dimuat. Periksa URL, format file, dan dukungan codec.';
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

    this.filterNodes.forEach((node, freqName) => {
      node.gain.setTargetAtTime(bypass ? 0 : (this.eqState.bands[freqName] ?? 0), this.ctx!.currentTime, 0.05);
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

    const rms = Math.sqrt(sumSquares / Math.max(1, samples.length));
    return {
      rmsDb: linearToDb(rms, -60),
      peakDb: linearToDb(peak, -60),
    };
  }

  private emitTelemetry(): void {
    const frequencyData = this.analyserNode
      ? new Uint8Array(this.analyserNode.frequencyBinCount)
      : new Uint8Array(64);

    if (this.analyserNode) this.analyserNode.getByteFrequencyData(frequencyData);

    const left = this.measureLevel(this.leftAnalyser);
    const right = this.measureLevel(this.rightAnalyser);
    const telemetry: AudioTelemetry = {
      currentTimeMs: this.getCurrentPositionMs(),
      durationMs: this.getDurationMs(),
      rmsLeft: left.rmsDb,
      rmsRight: right.rmsDb,
      peakLeft: left.peakDb,
      peakRight: right.peakDb,
      frequencyData,
    };

    this.telemetryListeners.forEach((listener) => listener(telemetry));
  }
}

export const audioEngine = new AudioEngine();
