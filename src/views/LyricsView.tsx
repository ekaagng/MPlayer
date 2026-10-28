import React, { useState, useEffect, useRef } from 'react';
import { LRCLine, Track } from '../types/audio';
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
  const [lyricsLines, setLyricsLines] = useState<LRCLine[]>([]);
  const [activeLineIndex, setActiveLineIndex] = useState<number>(-1);
  const [showEditorMode, setShowEditorMode] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('Lirik tersinkronisasi otomatis dengan audio.');
  const [dbSaved, setDbSaved] = useState(false);
  const [regexFind, setRegexFind] = useState('');
  const [regexReplace, setRegexReplace] = useState('');
  const [newLyricText, setNewLyricText] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const syncedCount = lyricsLines.filter((line) => line.synced).length;
  const syncPercentage = lyricsLines.length === 0 ? 0 : Math.round((syncedCount / lyricsLines.length) * 100);
  const currentTrackId = currentTrack?.id ?? null;

  // Load lyrics per track; browser preview storage is not the native SQLite database.
  useEffect(() => {
    if (!currentTrackId || !currentTrack) {
      setLyricsLines([]);
      setActiveLineIndex(-1);
      setStatusMessage('Pilih lagu untuk menambahkan atau menyinkronkan lirik.');
      return;
    }
    let loadedLines: LRCLine[] = currentTrack.lrcLines ?? [];
    try {
      const stored = window.localStorage.getItem(`mplayer:lyrics:${currentTrackId}`);
      if (stored) {
        const parsed = JSON.parse(stored) as LRCLine[];
        if (Array.isArray(parsed) && parsed.every((line) =>
          typeof line.id === 'string' && typeof line.text === 'string' &&
          typeof line.timeMs === 'number' && typeof line.synced === 'boolean'
        )) loadedLines = parsed;
      }
    } catch {
      setStatusMessage('Lirik tersimpan tidak dapat dibaca; memuat lirik dari metadata lagu.');
    }
    setLyricsLines(loadedLines.map((line) => ({
      ...line,
      timeFormatted: line.synced ? formatTimestamp(line.timeMs) : '[--:--.--]',
    })));
    setActiveLineIndex(loadedLines.length > 0 ? 0 : -1);
    setStatusMessage(loadedLines.length > 0 ? 'Lirik lagu dimuat.' : 'Belum ada lirik untuk lagu ini. Impor file .LRC atau tambahkan lirik.');
  }, [currentTrackId]);

  // Keep the highlighted line tied to the current playback position.
  useEffect(() => {
    if (lyricsLines.length === 0) {
      setActiveLineIndex(-1);
      return;
    }
    let matchIndex = -1;
    for (let i = lyricsLines.length - 1; i >= 0; i--) {
      if (lyricsLines[i].synced && currentTimeMs >= lyricsLines[i].timeMs) {
        matchIndex = i;
        break;
      }
    }
    setActiveLineIndex(matchIndex >= 0 ? matchIndex : 0);
  }, [currentTimeMs, lyricsLines]);

  const handleTagActiveLine = (lineIndex = activeLineIndex) => {
    if (!currentTrack || lineIndex < 0 || !lyricsLines[lineIndex]) {
      setStatusMessage('Pilih lagu dan baris lirik terlebih dahulu.');
      return;
    }
    const currentMs = Math.max(0, Math.round(currentTimeMs));
    setLyricsLines((prev) => prev.map((line, index) => index === lineIndex
      ? { ...line, timeMs: currentMs, timeFormatted: formatTimestamp(currentMs), synced: true }
      : line
    ));
    setDbSaved(false);
    setStatusMessage(`Waktu ${formatTimestamp(currentMs)} dicatat untuk Baris ${lineIndex + 1}. Simpan lirik untuk mempertahankan perubahan.`);
  };

  const handleAddLyricLine = () => {
    const text = newLyricText.trim();
    if (!currentTrack) {
      setStatusMessage('Pilih lagu sebelum menambahkan lirik.');
      return;
    }
    if (!text) {
      setStatusMessage('Tulis teks lirik terlebih dahulu.');
      return;
    }
    setLyricsLines((prev) => [...prev, {
      id: `manual-${Date.now()}`,
      timeMs: 0,
      timeFormatted: '[--:--.--]',
      text,
      isInstrumental: /instrumental|solo/i.test(text),
      synced: false,
    }]);
    setNewLyricText('');
    setDbSaved(false);
    setStatusMessage('Baris lirik ditambahkan tanpa timestamp. Gunakan Tag pada baris tersebut saat audio mencapai waktunya.');
  };

  const handleShiftOffset = (deltaMs: number) => {
    setLyricsLines((prev) => shiftTimestamps(prev, deltaMs));
    setDbSaved(false);
    setStatusMessage(`Offset waktu diterapkan: ${deltaMs > 0 ? `+${deltaMs}` : deltaMs}ms.`);
  };

  const handleCommitToDb = () => {
    if (!currentTrack) {
      setStatusMessage('Pilih lagu sebelum menyimpan lirik.');
      return;
    }
    try {
      window.localStorage.setItem(`mplayer:lyrics:${currentTrack.id}`, JSON.stringify(lyricsLines));
      setDbSaved(true);
      setStatusMessage('Lirik tersimpan di penyimpanan browser lokal. Ini belum tersimpan ke SQLite native.');
      setTimeout(() => setDbSaved(false), 2500);
    } catch {
      setDbSaved(false);
      setStatusMessage('Gagal menyimpan lirik ke penyimpanan browser. Periksa ruang penyimpanan.');
    }
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
      const content = typeof event.target?.result === 'string' ? event.target.result : '';
      const parsed = parseLrc(content);
      if (parsed.length === 0) {
        setStatusMessage(`Tidak ada baris lirik yang dapat dibaca dari ${file.name}. Periksa format file.`);
        return;
      }
      setLyricsLines(parsed);
      setActiveLineIndex(0);
      setDbSaved(false);
      setStatusMessage(`Memuat ${parsed.length} baris dari ${file.name}. Tekan Simpan untuk menyimpannya pada lagu ini.`);
    };
    reader.onerror = () => setStatusMessage(`Gagal membaca file ${file.name}.`);
    reader.onloadend = () => { if (fileInputRef.current) fileInputRef.current.value = ''; };
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
      setDbSaved(false);
      setStatusMessage('Pola teks berhasil diperbarui. Simpan lirik untuk mempertahankan perubahan.');
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
                {currentTrack?.title || 'Belum ada lagu dipilih'}
              </span>
              <span className="text-[10px] font-mono font-bold bg-primary-container px-1.5 py-0.2 border border-outline">
                {syncPercentage}% Sinkron
              </span>
            </div>
            <p className="text-xs font-body text-on-surface-variant">
              {currentTrack?.artist || '—'} • {statusMessage}
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
            disabled={!currentTrack || lyricsLines.length === 0}
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
                  onClick={() => { if (line.synced) onSeek(line.timeMs); }}
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
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] font-mono">{line.timeFormatted}</span>
                    {showEditorMode && <button type="button" onClick={(event) => { event.stopPropagation(); handleTagActiveLine(idx); }} className="px-2 py-1 bg-secondary text-on-secondary text-[10px] font-bold uppercase border border-outline">Tag</button>}
                  </div>
                </div>
              );
            }

            return (
              <div
                key={line.id}
                onClick={() => { if (line.synced) onSeek(line.timeMs); }}
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
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] font-mono text-on-surface-variant">
                    {line.synced ? line.timeFormatted : '--:--'}
                  </span>
                  {showEditorMode && <button type="button" onClick={(event) => { event.stopPropagation(); handleTagActiveLine(idx); }} className="px-2 py-1 bg-surface-container border border-outline text-[10px] font-bold uppercase">Tag</button>}
                </div>
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
                {dbSaved ? 'Tersimpan!' : 'Simpan lirik'}
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <label htmlFor="new-lyric-text" className="sr-only">Teks baris lirik baru</label>
            <input id="new-lyric-text" value={newLyricText} onChange={(event) => setNewLyricText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') handleAddLyricLine(); }} placeholder="Tulis baris lirik baru..." className="flex-1 bg-surface-bright px-3 py-2 text-sm border border-outline" />
            <button type="button" onClick={handleAddLyricLine} className="px-3 py-2 bg-surface-bright border border-outline text-xs font-bold uppercase">Tambah baris</button>
          </div>

          {/* Quick Tag Button */}
          <button
            disabled={!currentTrack || activeLineIndex < 0}
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
