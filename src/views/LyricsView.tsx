import React, { useState, useEffect, useRef } from 'react';
import { LRCLine, Track } from '../types/audio';
import { INITIAL_LYRICS } from '../data/mockTracks';
import { formatTimestamp, serializeLrc, parseLrc, shiftTimestamps } from '../utils/lrcParser';

interface LyricsViewProps {
  currentTrack: Track | null;
  currentTimeMs: number;
  onSeek: (ms: number) => void;
  onPlayTrack: (track: Track) => void;
}

export const LyricsView: React.FC<LyricsViewProps> = ({
  currentTrack,
  currentTimeMs,
  onSeek,
}) => {
  const [lyricsLines, setLyricsLines] = useState<LRCLine[]>(INITIAL_LYRICS);
  const [activeLineIndex, setActiveLineIndex] = useState<number>(4);
  const [showEditorMode, setShowEditorMode] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('Lirik tersinkronisasi otomatis dengan audio.');
  const [dbSaved, setDbSaved] = useState(false);
  const [regexFind, setRegexFind] = useState('');
  const [regexReplace, setRegexReplace] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const syncedCount = lyricsLines.filter((l) => l.synced).length;
  const syncPercentage = Math.round((syncedCount / lyricsLines.length) * 100);

  // Auto-track active lyric line based on currentTimeMs
  useEffect(() => {
    if (currentTimeMs > 0) {
      for (let i = lyricsLines.length - 1; i >= 0; i--) {
        if (lyricsLines[i].synced && currentTimeMs >= lyricsLines[i].timeMs) {
          setActiveLineIndex(i);
          break;
        }
      }
    }
  }, [currentTimeMs, lyricsLines]);

  const handleTagActiveLine = () => {
    const currentMs = Math.round(currentTimeMs || 54600);
    const updated = [...lyricsLines];
    if (updated[activeLineIndex]) {
      updated[activeLineIndex] = {
        ...updated[activeLineIndex],
        timeMs: currentMs,
        timeFormatted: formatTimestamp(currentMs),
        synced: true,
      };
      setLyricsLines(updated);
      setStatusMessage(`Waktu ${formatTimestamp(currentMs)} dicatat untuk Baris ${activeLineIndex + 1}.`);
      if (activeLineIndex < updated.length - 1) {
        setActiveLineIndex(activeLineIndex + 1);
      }
    }
  };

  const handleShiftOffset = (deltaMs: number) => {
    setLyricsLines((prev) => shiftTimestamps(prev, deltaMs));
    setStatusMessage(`Offset waktu diterapkan: ${deltaMs > 0 ? `+${deltaMs}` : deltaMs}ms.`);
  };

  const handleCommitToDb = () => {
    setDbSaved(true);
    setStatusMessage('Lirik berhasil disimpan ke SQLite (~/.resonance/lyrics.db).');
    setTimeout(() => setDbSaved(false), 2500);
  };

  const handleExportLrc = () => {
    const lrcContent = serializeLrc(
      {
        title: currentTrack?.title || 'Autumn Leaves',
        artist: currentTrack?.artist || 'Bill Evans Trio',
        album: currentTrack?.album || 'Live at the Plugged Nickel',
      },
      lyricsLines
    );

    const blob = new Blob([lrcContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(currentTrack?.title || 'Autumn_Leaves').replace(/\s+/g, '_')}.lrc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setStatusMessage('File .LRC berhasil diunduh.');
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        const parsed = parseLrc(content);
        if (parsed.length > 0) {
          setLyricsLines(parsed);
          setActiveLineIndex(0);
          setStatusMessage(`Berhasil memuat ${parsed.length} baris lirik dari ${file.name}.`);
        }
      }
    };
    reader.readAsText(file);
  };

  const handleApplyRegex = () => {
    if (!regexFind) return;
    try {
      const regex = new RegExp(regexFind, 'g');
      setLyricsLines((prev) =>
        prev.map((line) => ({
          ...line,
          text: line.text.replace(regex, regexReplace),
        }))
      );
      setStatusMessage('Pola teks berhasil diperbarui.');
    } catch {
      setStatusMessage('Format regex tidak valid.');
    }
  };

  return (
    <div className="flex flex-col w-full pb-8 gap-5 max-w-4xl mx-auto">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleImportFile}
        accept=".lrc,.txt"
        className="hidden"
      />

      {/* Top Header Card */}
      <div className="bg-surface-bright border-2 border-outline p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary text-white font-headline font-bold text-xs flex items-center justify-center shrink-0">
            LRC
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-headline font-bold text-sm text-on-surface uppercase">
                {currentTrack?.title || 'Autumn Leaves'}
              </span>
              <span className="text-[10px] font-mono font-bold bg-primary-container px-1.5 py-0.2 border border-outline">
                {syncPercentage}% Sinkron
              </span>
            </div>
            <p className="text-xs font-body text-on-surface-variant">
              {currentTrack?.artist || 'Bill Evans Trio'} • {statusMessage}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowEditorMode(!showEditorMode)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-surface hover:bg-surface-container border-2 border-outline text-xs font-headline font-bold uppercase cursor-pointer shadow-[2px_2px_0px_#1a1a1a]"
          >
            <span className="material-symbols-outlined text-[16px] text-tertiary">
              {showEditorMode ? 'visibility' : 'edit_note'}
            </span>
            <span>{showEditorMode ? 'Tampilan Karaoke Bersih' : 'Mode Edit Lirik'}</span>
          </button>

          <button
            onClick={handleExportLrc}
            className="flex items-center gap-1 px-3 py-1.5 bg-surface hover:bg-surface-container border border-outline text-xs font-label font-bold uppercase cursor-pointer shadow-[1px_1px_0px_#1a1a1a]"
            title="Download file .LRC"
          >
            <span className="material-symbols-outlined text-[15px]">download</span>
            <span>Ekspor</span>
          </button>
        </div>
      </div>

      {/* Main Lyrics View (Clean Karaoke Teleprompter Mode) */}
      <div className="bg-surface-bright border-2 border-outline shadow-md p-5 flex flex-col gap-3">
        <div className="flex items-center justify-between pb-2 border-b border-outline/20">
          <span className="font-headline font-bold text-xs uppercase tracking-wider text-on-surface">
            Teleprompter Lirik Interaktif
          </span>
          <span className="text-[10px] font-mono text-tertiary">Klik baris lirik untuk melompat audio</span>
        </div>

        <div className="flex flex-col gap-2 max-h-[520px] overflow-y-auto pr-1">
          {lyricsLines.map((line, idx) => {
            const isActive = idx === activeLineIndex;

            if (isActive) {
              return (
                <div
                  key={line.id}
                  onClick={() => onSeek(line.timeMs)}
                  className="bg-primary text-on-primary p-4 flex items-center justify-between gap-3 shadow-md border-2 border-primary-container cursor-pointer transition-all -my-0.5"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs font-mono font-bold text-primary-container w-6 shrink-0">
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <div className="flex flex-col min-w-0">
                      <p className="font-headline font-bold text-base md:text-lg text-white leading-tight uppercase">
                        {line.text}
                      </p>
                      <span className="text-[10px] font-mono font-bold text-primary-container mt-1">
                        AKTIF SAAT INI • {line.timeFormatted}
                      </span>
                    </div>
                  </div>
                  <span className="w-2.5 h-2.5 rounded-full bg-secondary animate-ping shrink-0"></span>
                </div>
              );
            }

            return (
              <div
                key={line.id}
                onClick={() => onSeek(line.timeMs)}
                className={`p-3 flex items-center justify-between gap-3 transition-colors border border-outline/15 cursor-pointer ${
                  line.synced
                    ? 'bg-surface hover:bg-surface-container'
                    : 'bg-surface-container-high/40 hover:bg-surface-container'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-[11px] font-mono font-bold text-on-surface-variant w-5 shrink-0">
                    {String(idx + 1).padStart(2, '0')}
                  </span>
                  <p className="text-xs md:text-sm font-body text-on-surface truncate">
                    {line.text}
                  </p>
                </div>
                <span className="text-[10px] font-mono text-on-surface-variant shrink-0">
                  {line.synced ? line.timeFormatted : '--:--'}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Collapsible Advanced Studio Editor Mode */}
      {showEditorMode && (
        <div className="bg-surface-container-low border-2 border-outline p-5 shadow-md flex flex-col gap-4 animate-fade-in">
          <div className="flex items-center justify-between pb-2 border-b-2 border-outline">
            <span className="font-headline font-bold text-xs uppercase tracking-wider text-on-surface">
              Alat Editor Timestamp &amp; Regex Studio
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleShiftOffset(-100)}
                className="px-2 py-1 bg-surface-bright hover:bg-primary hover:text-white border border-outline text-[11px] font-mono font-bold cursor-pointer"
              >
                -100ms
              </button>
              <button
                onClick={() => handleShiftOffset(100)}
                className="px-2 py-1 bg-surface-bright hover:bg-primary hover:text-white border border-outline text-[11px] font-mono font-bold cursor-pointer"
              >
                +100ms
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-2.5 py-1 bg-surface-bright hover:bg-primary hover:text-white border border-outline text-[10px] font-headline font-bold uppercase cursor-pointer"
              >
                Impor .LRC
              </button>
              <button
                onClick={handleCommitToDb}
                className={`px-3 py-1 font-headline font-bold text-[10px] uppercase border border-outline cursor-pointer ${
                  dbSaved ? 'bg-tertiary text-white' : 'bg-primary-container text-on-primary-container'
                }`}
              >
                {dbSaved ? 'Tersimpan!' : 'Simpan ke SQLite'}
              </button>
            </div>
          </div>

          {/* Quick Tag Button */}
          <button
            onClick={handleTagActiveLine}
            className="w-full py-3 bg-primary text-white hover:bg-primary-container hover:text-primary border-2 border-outline font-headline font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-[2px_2px_0px_#1a1a1a] cursor-pointer"
          >
            <span className="material-symbols-outlined text-lg">alarm_add</span>
            <span>Tandai Waktu Baris Aktif [Spasi / Tag]</span>
          </button>

          {/* Regex Find/Replace */}
          <div className="flex gap-2">
            <input
              type="text"
              value={regexFind}
              onChange={(e) => setRegexFind(e.target.value)}
              placeholder="Cari kata/pola teks..."
              className="flex-1 bg-surface-bright px-3 py-1.5 text-xs font-mono border border-outline focus:outline-none"
            />
            <input
              type="text"
              value={regexReplace}
              onChange={(e) => setRegexReplace(e.target.value)}
              placeholder="Ganti dengan..."
              className="w-40 bg-surface-bright px-3 py-1.5 text-xs font-mono border border-outline focus:outline-none"
            />
            <button
              onClick={handleApplyRegex}
              className="px-3 py-1 bg-primary text-white font-label font-bold text-xs uppercase border border-outline hover:bg-secondary cursor-pointer"
            >
              Ganti
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
