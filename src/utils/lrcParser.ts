import { LRCLine } from '../types/audio';

const TIMESTAMP_PATTERN = /\[(\d{1,3}:[0-5]\d(?:[.:]\d{1,3})?|--:--\.--)\]/g;

/** Converts milliseconds to standard LRC [mm:ss.xx] centisecond format. */
export function formatTimestamp(ms: number): string {
  const safeMs = Number.isFinite(ms) ? Math.max(0, Math.floor(ms)) : 0;
  const totalSeconds = Math.floor(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const centiseconds = Math.floor((safeMs % 1000) / 10);
  const pad2 = (value: number) => String(value).padStart(2, '0');
  return `[${pad2(minutes)}:${pad2(seconds)}.${pad2(centiseconds)}]`;
}

/** Parses [mm:ss.xx], [mm:ss:xxx], and fractional timestamp variants to milliseconds. */
export function parseTimestamp(tag: string): number | null {
  const clean = tag.replace(/[\[\]]/g, '').trim();
  const match = clean.match(/^(\d{1,3}):([0-5]\d)(?:[.:](\d{1,3}))?$/);
  if (!match) return null;

  const minutes = Number.parseInt(match[1], 10);
  const seconds = Number.parseInt(match[2], 10);
  const fraction = match[3] ?? '0';
  const millis = Number.parseInt(fraction.padEnd(3, '0'), 10);
  return minutes * 60_000 + seconds * 1_000 + millis;
}

/** Parses standard LRC, including multiple timestamps for one lyric and plain-text lines. */
export function parseLrc(content: string): LRCLine[] {
  const parsed: LRCLine[] = [];
  const rawLines = content.replace(/^\uFEFF/, '').split(/\r?\n/);

  rawLines.forEach((rawLine, lineIndex) => {
    const trimmed = rawLine.trim();
    if (!trimmed) return;
    if (/^\[(ti|ar|al|au|by|offset|re|ve):.*\]$/i.test(trimmed)) return;

    const timestampMatches = [...trimmed.matchAll(new RegExp(TIMESTAMP_PATTERN.source, 'g'))];
    if (timestampMatches.length === 0) {
      parsed.push({
        id: `line-${lineIndex}-0`,
        timeMs: 0,
        timeFormatted: '[--:--.--]',
        text: trimmed,
        isInstrumental: /instrumental|solo/i.test(trimmed),
        synced: false,
      });
      return;
    }

    const lastMatch = timestampMatches[timestampMatches.length - 1];
    const text = trimmed.slice((lastMatch.index ?? 0) + lastMatch[0].length).trim();
    timestampMatches.forEach((match, timestampIndex) => {
      const rawTag = match[1];
      const isUnsynced = rawTag.includes('--');
      const timeMs = isUnsynced ? 0 : (parseTimestamp(rawTag) ?? 0);
      parsed.push({
        id: `line-${lineIndex}-${timestampIndex}`,
        timeMs,
        timeFormatted: isUnsynced ? '[--:--.--]' : formatTimestamp(timeMs),
        text,
        isInstrumental: /instrumental|solo/i.test(text),
        synced: !isUnsynced,
      });
    });
  });

  return parsed;
}

/** Serializes lyrics and metadata to an LRC text file. */
export function serializeLrc(
  metadata: { title: string; artist: string; album: string; offset?: number },
  lines: LRCLine[]
): string {
  const headers = [
    `[ti:${metadata.title}]`,
    `[ar:${metadata.artist}]`,
    `[al:${metadata.album}]`,
    `[offset:${metadata.offset ?? 0}]`,
    '',
  ];

  const lineOutputs = lines.map((line) =>
    line.synced ? `${formatTimestamp(line.timeMs)} ${line.text}` : `[--:--.--] ${line.text}`
  );
  return [...headers, ...lineOutputs].join('\n');
}

/** Applies an offset to synchronized timestamps; unsynchronized lines remain untouched. */
export function shiftTimestamps(lines: LRCLine[], deltaMs: number): LRCLine[] {
  if (!Number.isFinite(deltaMs)) return lines;
  return lines.map((line) => {
    if (!line.synced) return line;
    const timeMs = Math.max(0, line.timeMs + Math.trunc(deltaMs));
    return { ...line, timeMs, timeFormatted: formatTimestamp(timeMs) };
  });
}
