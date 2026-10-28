import { LRCLine } from '../types/audio';

/**
 * Converts milliseconds to [mm:ss.xx] centisecond format
 */
export function formatTimestamp(ms: number): string {
  if (ms < 0) ms = 0;
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const centiseconds = Math.floor((ms % 1000) / 10);
  
  const pad2 = (n: number) => String(n).padStart(2, '0');
  return `[${pad2(minutes)}:${pad2(seconds)}.${pad2(centiseconds)}]`;
}

/**
 * Parses [mm:ss.xx] or [mm:ss:xxx] to milliseconds
 */
export function parseTimestamp(tag: string): number | null {
  const clean = tag.replace(/[\[\]]/g, '').trim();
  const match = clean.match(/^(\d{2}):(\d{2})(?:[.:](\d{2,3}))?$/);
  if (!match) return null;

  const minutes = parseInt(match[1], 10);
  const seconds = parseInt(match[2], 10);
  let sub = match[3] || '00';
  if (sub.length === 2) {
    sub += '0';
  } else if (sub.length > 3) {
    sub = sub.slice(0, 3);
  }
  const millis = parseInt(sub.padEnd(3, '0'), 10);

  return minutes * 60 * 1000 + seconds * 1000 + millis;
}

/**
 * Parses standard .LRC text content into structured LRCLine items
 */
export function parseLrc(content: string): LRCLine[] {
  const rawLines = content.split(/\r?\n/);
  const lines: LRCLine[] = [];

  rawLines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    // Check for ID tags like [ti:], [ar:], [al:]
    if (/^\[(ti|ar|al|au|by|offset):.*\]$/i.test(trimmed)) {
      return;
    }

    // Match timestamp regex: [00:24.12] or [--:--.--]
    const timeMatch = trimmed.match(/^\[(\d{2}:\d{2}[.:]\d{2,3}|--:--\.--)\]\s*(.*)$/);
    if (timeMatch) {
      const rawTag = timeMatch[1];
      const text = timeMatch[2] || '';
      const isUnsynced = rawTag.includes('--');
      const timeMs = isUnsynced ? 0 : (parseTimestamp(rawTag) ?? 0);

      lines.push({
        id: `line-${index}-${Date.now()}`,
        timeMs,
        timeFormatted: isUnsynced ? '[--:--.--]' : formatTimestamp(timeMs),
        text,
        isInstrumental: text.toLowerCase().includes('instrumental') || text.toLowerCase().includes('solo'),
        synced: !isUnsynced,
      });
    } else if (trimmed.startsWith('[')) {
      // Unrecognized tag or raw line
      lines.push({
        id: `line-${index}-${Date.now()}`,
        timeMs: 0,
        timeFormatted: '[--:--.--]',
        text: trimmed,
        isInstrumental: false,
        synced: false,
      });
    }
  });

  return lines;
}

/**
 * Serializes lines back into .LRC file format with metadata tags
 */
export function serializeLrc(
  metadata: { title: string; artist: string; album: string; offset?: number },
  lines: LRCLine[]
): string {
  const headers = [
    `[ti:${metadata.title}]`,
    `[ar:${metadata.artist}]`,
    `[al:${metadata.album}]`,
    `[offset:${metadata.offset || 0}]`,
    '',
  ];

  const lineOutputs = lines.map((line) => {
    if (!line.synced) {
      return `[--:--.--] ${line.text}`;
    }
    return `${formatTimestamp(line.timeMs)} ${line.text}`;
  });

  return [...headers, ...lineOutputs].join('\n');
}

/**
 * Nudges all synchronized timestamps by a delta in milliseconds (+/- ms)
 */
export function shiftTimestamps(lines: LRCLine[], deltaMs: number): LRCLine[] {
  return lines.map((line) => {
    if (!line.synced) return line;
    const newMs = Math.max(0, line.timeMs + deltaMs);
    return {
      ...line,
      timeMs: newMs,
      timeFormatted: formatTimestamp(newMs),
    };
  });
}
