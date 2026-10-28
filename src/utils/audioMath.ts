/**
 * Pure audio mathematics and telemetry calculations
 */

export function linearToDb(linear: number, minDb: number = -60): number {
  if (linear <= 0.00001) return minDb;
  const db = 20 * Math.log10(linear);
  return Math.max(minDb, Math.min(6, db));
}

export function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}

export function calculateBufferLatency(samples: number, sampleRate: number): number {
  if (sampleRate <= 0) return 0;
  return Number(((samples / sampleRate) * 1000).toFixed(1));
}

export function formatTimecodeCentiseconds(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const millis = ms % 1000;

  const pad2 = (n: number) => String(n).padStart(2, '0');
  const pad3 = (n: number) => String(n).padStart(3, '0');
  return `${pad2(minutes)}:${pad2(seconds)}.${pad3(millis)}`;
}

export function calculateAutoPreamp(bands: Record<string, number>): number {
  let maxBoost = 0;
  for (const gain of Object.values(bands)) {
    if (gain > maxBoost) maxBoost = gain;
  }
  // Safeguard: attenuate preamp by max boost + 0.5dB headroom guard
  if (maxBoost > 0) {
    return Number((-maxBoost - 0.5).toFixed(1));
  }
  return 0.0;
}
