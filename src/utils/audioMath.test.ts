import test from 'node:test';
import assert from 'node:assert/strict';
import {
  linearToDb,
  dbToLinear,
  calculateBufferLatency,
  formatTimecodeCentiseconds,
  calculateAutoPreamp,
} from './audioMath';

test('linearToDb converts amplitude to decibels accurately', () => {
  assert.equal(linearToDb(1.0), 0);
  assert.ok(Math.abs(linearToDb(0.5) - -6.02) < 0.1);
  assert.equal(linearToDb(0), -60);
});

test('dbToLinear inverts decibels correctly', () => {
  assert.equal(dbToLinear(0), 1);
  assert.ok(Math.abs(dbToLinear(-6.02) - 0.5) < 0.05);
});

test('calculateBufferLatency calculates low-latency DMA correctly', () => {
  // 128 samples at 48000 Hz = ~2.66 ms -> rounded to 2.7 ms
  assert.equal(calculateBufferLatency(128, 48000), 2.7);
  // 64 samples at 48000 Hz = 1.3 ms
  assert.equal(calculateBufferLatency(64, 48000), 1.3);
});

test('formatTimecodeCentiseconds formats correctly', () => {
  assert.equal(formatTimecodeCentiseconds(221228), '03:41.228');
  assert.equal(formatTimecodeCentiseconds(0), '00:00.000');
});

test('calculateAutoPreamp protects against digital clipping', () => {
  const bands = {
    '31Hz': 3.5,
    '62Hz': 2.5,
    '1kHz': 0.0,
    '16kHz': 4.0,
  };
  // Max boost is 4.0 dB, so auto preamp should be -4.5 dB
  assert.equal(calculateAutoPreamp(bands), -4.5);

  const flatBands = { '31Hz': 0, '1kHz': 0 };
  assert.equal(calculateAutoPreamp(flatBands), 0.0);
});
