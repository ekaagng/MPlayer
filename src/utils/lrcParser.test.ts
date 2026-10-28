import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatTimestamp,
  parseTimestamp,
  parseLrc,
  serializeLrc,
  shiftTimestamps,
} from './lrcParser';

test('formatTimestamp converts ms to centisecond format [mm:ss.xx]', () => {
  assert.equal(formatTimestamp(24120), '[00:24.12]');
  assert.equal(formatTimestamp(54600), '[00:54.60]');
  assert.equal(formatTimestamp(65180), '[01:05.18]');
});

test('parseTimestamp parses valid tags to milliseconds', () => {
  assert.equal(parseTimestamp('[00:24.12]'), 24120);
  assert.equal(parseTimestamp('00:54.60'), 54600);
  assert.equal(parseTimestamp('invalid'), null);
});

test('parseLrc extracts synchronized lines and skips metadata tags', () => {
  const sample = `
[ti:Autumn Leaves]
[ar:Bill Evans Trio]
[00:24.12] The falling leaves drift by the window
[00:31.45] The autumn leaves of red and gold
[--:--.--] Since you went away the days grow long
`;
  const lines = parseLrc(sample);
  assert.equal(lines.length, 3);
  assert.equal(lines[0].text, 'The falling leaves drift by the window');
  assert.equal(lines[0].synced, true);
  assert.equal(lines[0].timeMs, 24120);
  assert.equal(lines[2].synced, false);
});

test('shiftTimestamps applies positive and negative offsets', () => {
  const lines = [
    {
      id: '1',
      timeMs: 24120,
      timeFormatted: '[00:24.12]',
      text: 'Line 1',
      synced: true,
    },
    {
      id: '2',
      timeMs: 0,
      timeFormatted: '[--:--.--]',
      text: 'Unsynced line',
      synced: false,
    },
  ];

  const shiftedForward = shiftTimestamps(lines, 100);
  assert.equal(shiftedForward[0].timeMs, 24220);
  assert.equal(shiftedForward[0].timeFormatted, '[00:24.22]');
  assert.equal(shiftedForward[1].timeMs, 0); // unsynced unchanged

  const shiftedBack = shiftTimestamps(lines, -100);
  assert.equal(shiftedBack[0].timeMs, 24020);
});

test('serializeLrc generates compliant text output', () => {
  const metadata = {
    title: 'Autumn Leaves',
    artist: 'Bill Evans Trio',
    album: 'Portrait in Jazz',
  };
  const lines = [
    {
      id: '1',
      timeMs: 24120,
      timeFormatted: '[00:24.12]',
      text: 'First line',
      synced: true,
    },
  ];
  const output = serializeLrc(metadata, lines);
  assert.ok(output.includes('[ti:Autumn Leaves]'));
  assert.ok(output.includes('[00:24.12] First line'));
});

test('parseLrc expands repeated timestamps and keeps plain text as unsynchronized lyrics', () => {
  const lines = parseLrc('[00:10.1][00:12.25]Repeat\nPlain lyric line\n[00:61.00]Invalid timestamp');
  assert.equal(lines.length, 4);
  assert.equal(lines[0].timeMs, 10100);
  assert.equal(lines[1].timeMs, 12250);
  assert.equal(lines[0].text, 'Repeat');
  assert.equal(lines[1].text, 'Repeat');
  assert.equal(lines[2].text, 'Plain lyric line');
  assert.equal(lines[2].synced, false);
  assert.equal(lines[3].synced, false);
});

test('parseTimestamp rejects seconds outside 00-59', () => {
  assert.equal(parseTimestamp('[00:60.00]'), null);
  assert.equal(parseTimestamp('[00:59.999]'), 59999);
});
