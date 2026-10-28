import { EqualizerState, EQFrequency, Track } from '../types/audio';
import { linearToDb } from '../utils/audioMath';

const FREQUENCIES: { name: EQFrequency; freq: number }[] = [
  { name: '31Hz', freq: 31 },
  { name: '62Hz', freq: 62 },
  { name: '125Hz', freq: 125 },
  { name: '250Hz', freq: 250 },
  { name: '500Hz', freq: 500 },
  { name: '1kHz', freq: 1000 },
  { name: '2kHz', freq: 2000 },
  { name: '4kHz', freq: 4000 },
  { name: '8kHz', freq: 8000 },
  { name: '16kHz', freq: 16000 },
];

export interface AudioTelemetry {
  currentTimeMs: number;
  durationMs: number;
  rmsLeft: number;
  rmsRight: number;
  peakLeft: number;
  peakRight: number;
  frequencyData: Uint8Array;
}

class AudioEngine {
  private ctx: AudioContext | null = null;
  private preampNode: GainNode | null = null;
  private filterNodes: Map<EQFrequency, BiquadFilterNode> = new Map();
  private limiterNode: DynamicsCompressorNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private masterGain: GainNode | null = null;
  private synthInterval: number | null = null;
  private animationFrameId: number | null = null;

  private isPlaying = false;
  private playbackOffsetMs = 0;
  private playStartTime = 0;
  private currentTrack: Track | null = null;
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

  private telemetryListeners: Set<(telemetry: AudioTelemetry) => void> = new Set();
  private trackEndListeners: Set<() => void> = new Set();

  private initContext() {
    if (this.ctx) return;
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AudioContextClass();

    this.preampNode = this.ctx.createGain();
    this.preampNode.gain.value = Math.pow(10, this.eqState.preamp / 20);

    // Build 10-band peaking filters in cascade
    let lastNode: AudioNode = this.preampNode;
    FREQUENCIES.forEach(({ name, freq }) => {
      const filter = this.ctx!.createBiquadFilter();
      filter.type = 'peaking';
      filter.frequency.value = freq;
      filter.Q.value = 1.41;
      filter.gain.value = this.eqState.bands[name] || 0;
      this.filterNodes.set(name, filter);
      lastNode.connect(filter);
      lastNode = filter;
    });

    // Limiter
    this.limiterNode = this.ctx.createDynamicsCompressor();
    this.limiterNode.threshold.value = 0.0;
    this.limiterNode.knee.value = 3.0;
    this.limiterNode.ratio.value = 20.0;
    this.limiterNode.attack.value = 0.002;
    this.limiterNode.release.value = 0.1;
    lastNode.connect(this.limiterNode);

    // Analyser
    this.analyserNode = this.ctx.createAnalyser();
    this.analyserNode.fftSize = 256;
    this.analyserNode.smoothingTimeConstant = 0.8;
    this.limiterNode.connect(this.analyserNode);

    // Master Output
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.85;
    this.analyserNode.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);
  }

  public subscribeTelemetry(listener: (telemetry: AudioTelemetry) => void) {
    this.telemetryListeners.add(listener);
    return () => this.telemetryListeners.delete(listener);
  }

  public subscribeTrackEnd(listener: () => void) {
    this.trackEndListeners.add(listener);
    return () => this.trackEndListeners.delete(listener);
  }

  public setVolume(vol: number) {
    if (this.masterGain) {
      this.masterGain.gain.value = Math.max(0, Math.min(1, vol));
    }
  }

  public setEqualizer(eq: EqualizerState) {
    this.eqState = eq;
    this.applyEq();
  }

  private applyEq() {
    if (!this.ctx || !this.preampNode) return;

    const bypass = !this.eqState.enabled || this.eqState.abMode === 'B';
    const preampDb = bypass ? 0.0 : this.eqState.preamp;
    this.preampNode.gain.setTargetAtTime(Math.pow(10, preampDb / 20), this.ctx.currentTime, 0.05);

    this.filterNodes.forEach((node, freqName) => {
      const gainVal = bypass ? 0.0 : (this.eqState.bands[freqName] || 0);
      node.gain.setTargetAtTime(gainVal, this.ctx!.currentTime, 0.05);
    });
  }

  public async playTrack(track: Track, startFromMs?: number) {
    this.initContext();
    if (this.ctx && this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    this.currentTrack = track;
    this.isPlaying = true;
    this.playbackOffsetMs = startFromMs ?? 0;
    this.playStartTime = this.ctx!.currentTime;

    this.startSynthesizerLoop();
    this.startTelemetryLoop();
  }

  public pause() {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    if (this.ctx) {
      this.playbackOffsetMs += (this.ctx.currentTime - this.playStartTime) * 1000;
    }
    this.stopSynthesizerLoop();
  }

  public resume() {
    if (!this.currentTrack) return;
    this.playTrack(this.currentTrack, this.playbackOffsetMs);
  }

  public seek(toMs: number) {
    const wasPlaying = this.isPlaying;
    this.playbackOffsetMs = Math.max(0, toMs);
    if (this.ctx) {
      this.playStartTime = this.ctx.currentTime;
    }
    if (!wasPlaying && this.currentTrack) {
      this.emitTelemetry();
    }
  }

  public isCurrentlyPlaying(): boolean {
    return this.isPlaying;
  }

  public getCurrentTrack(): Track | null {
    return this.currentTrack;
  }

  public getCurrentPositionMs(): number {
    if (!this.isPlaying || !this.ctx) return this.playbackOffsetMs;
    const elapsed = (this.ctx.currentTime - this.playStartTime) * 1000;
    return this.playbackOffsetMs + elapsed;
  }

  // Melodic jazz synthesizer generating harmonic tones through our real Web Audio chain
  private startSynthesizerLoop() {
    this.stopSynthesizerLoop();
    if (!this.ctx || !this.preampNode) return;

    let beat = 0;
    const chords = [
      [220.0, 261.63, 329.63, 392.0], // Am7
      [293.66, 349.23, 440.0, 523.25], // Dm7
      [196.0, 246.94, 293.66, 392.0], // G7
      [261.63, 329.63, 392.0, 493.88], // Cmaj7
      [174.61, 220.0, 261.63, 329.63], // Fmaj7
      [246.94, 293.66, 349.23, 440.0], // Bm7b5
      [164.81, 207.65, 246.94, 329.63], // E7
    ];

    this.synthInterval = window.setInterval(() => {
      if (!this.isPlaying || !this.ctx || !this.preampNode) return;

      const chordIndex = Math.floor(beat / 4) % chords.length;
      const currentChord = chords[chordIndex];

      // Play soft warm electric piano chord note
      const noteFreq = currentChord[beat % currentChord.length];
      const osc = this.ctx.createOscillator();
      const noteGain = this.ctx.createGain();

      osc.type = beat % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(noteFreq, this.ctx.currentTime);

      const noteVol = 0.07;
      noteGain.gain.setValueAtTime(noteVol, this.ctx.currentTime);
      noteGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.45);

      osc.connect(noteGain);
      noteGain.connect(this.preampNode);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.5);

      // Walking bass on every beat
      if (beat % 2 === 0) {
        const bassOsc = this.ctx.createOscillator();
        const bassGain = this.ctx.createGain();
        bassOsc.type = 'triangle';
        bassOsc.frequency.setValueAtTime(currentChord[0] / 2, this.ctx.currentTime);
        bassGain.gain.setValueAtTime(0.12, this.ctx.currentTime);
        bassGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.5);
        bassOsc.connect(bassGain);
        bassGain.connect(this.preampNode);
        bassOsc.start();
        bassOsc.stop(this.ctx.currentTime + 0.55);
      }

      beat++;
    }, 450);
  }

  private stopSynthesizerLoop() {
    if (this.synthInterval) {
      clearInterval(this.synthInterval);
      this.synthInterval = null;
    }
  }

  private startTelemetryLoop() {
    const loop = () => {
      this.emitTelemetry();
      if (this.isPlaying) {
        // Check if track ended
        if (this.currentTrack) {
          const pos = this.getCurrentPositionMs();
          if (pos >= this.currentTrack.duration * 1000) {
            this.pause();
            this.seek(0);
            this.trackEndListeners.forEach((l) => l());
            return;
          }
        }
        this.animationFrameId = requestAnimationFrame(loop);
      }
    };
    if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
    this.animationFrameId = requestAnimationFrame(loop);
  }

  private emitTelemetry() {
    if (!this.analyserNode) {
      const freqData = new Uint8Array(64);
      this.telemetryListeners.forEach((l) =>
        l({
          currentTimeMs: this.playbackOffsetMs,
          durationMs: this.currentTrack ? this.currentTrack.duration * 1000 : 0,
          rmsLeft: -60,
          rmsRight: -60,
          peakLeft: -60,
          peakRight: -60,
          frequencyData: freqData,
        })
      );
      return;
    }

    const bufferLength = this.analyserNode.frequencyBinCount;
    const freqData = new Uint8Array(bufferLength);
    this.analyserNode.getByteFrequencyData(freqData);

    // Calculate RMS & peak from frequency buffer
    let sum = 0;
    let peak = 0;
    for (let i = 0; i < bufferLength; i++) {
      const val = freqData[i] / 255;
      sum += val * val;
      if (val > peak) peak = val;
    }
    const rms = Math.sqrt(sum / bufferLength);

    const leftRmsDb = linearToDb(rms, -48);
    const rightRmsDb = linearToDb(rms * 0.94, -48);
    const leftPeakDb = linearToDb(peak, -36);
    const rightPeakDb = linearToDb(peak * 0.95, -36);

    const telemetry: AudioTelemetry = {
      currentTimeMs: this.getCurrentPositionMs(),
      durationMs: this.currentTrack ? this.currentTrack.duration * 1000 : 0,
      rmsLeft: leftRmsDb,
      rmsRight: rightRmsDb,
      peakLeft: leftPeakDb,
      peakRight: rightPeakDb,
      frequencyData: freqData,
    };

    this.telemetryListeners.forEach((listener) => listener(telemetry));
  }
}

export const audioEngine = new AudioEngine();
