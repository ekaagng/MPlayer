import React, { useState, useMemo, useEffect } from 'react';
import { Track, Playlist } from '../types/audio';
import { MOCK_TRACKS, INITIAL_PLAYLISTS } from '../data/mockTracks';

interface LibraryViewProps {
  currentTrack: Track | null;
  isPlaying: boolean;
  onPlayTrack: (track: Track) => void;
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  currentTrack,
  isPlaying,
  onPlayTrack,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFormatFilter, setActiveFormatFilter] = useState<string>('ALL');
  const [playlists, setPlaylists] = useState<Playlist[]>(() => {
    try {
      const stored = window.localStorage.getItem('mplayer:playlists');
      if (stored) {
        const parsed = JSON.parse(stored) as Playlist[];
        if (Array.isArray(parsed)) {
          return parsed.map((playlist) => ({
            ...playlist,
            trackIds: Array.isArray(playlist.trackIds) ? [...new Set(playlist.trackIds)] : [],
            trackCount: Array.isArray(playlist.trackIds) ? new Set(playlist.trackIds).size : 0,
          }));
        }
      }
    } catch {
      // Ignore unavailable or malformed browser storage and use an empty demo library.
    }
    return INITIAL_PLAYLISTS.map((playlist) => ({
      ...playlist,
      trackIds: [],
      trackCount: 0,
      subtitle: '0 lagu',
    }));
  });
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [trackToAdd, setTrackToAdd] = useState<Track | null>(null);
  const [playlistEditor, setPlaylistEditor] = useState<Playlist | null>(null);
  const [isPlaylistEditorOpen, setIsPlaylistEditorOpen] = useState(false);
  const [playlistName, setPlaylistName] = useState('');
  const [playlistToDelete, setPlaylistToDelete] = useState<Playlist | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncToast, setSyncToast] = useState<string | null>(null);
  const [swipedItemRestored, setSwipedItemRestored] = useState(false);
  const [showAddFolderModal, setShowAddFolderModal] = useState(false);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);

  useEffect(() => {
    try {
      window.localStorage.setItem('mplayer:playlists', JSON.stringify(playlists));
    } catch {
      setSyncToast('Playlist tidak dapat disimpan di penyimpanan browser ini.');
    }
  }, [playlists]);

  const filterChips = [
    { id: 'ALL', label: `Semua Lagu (${MOCK_TRACKS.length})` },
    { id: 'FLAC', label: 'FLAC Lossless' },
    { id: 'WAV', label: 'WAV Raw' },
    { id: 'HI-RES', label: 'Hi-Res >96kHz' },
    { id: 'DSD', label: 'DSD / DFF 5.6M' },
    { id: 'MP3', label: 'MP3 320k' },
  ];

  const filteredTracks = useMemo(() => {
    return MOCK_TRACKS.filter((track) => {
      if (activeFormatFilter === 'FLAC' && track.format !== 'FLAC') return false;
      if (activeFormatFilter === 'WAV' && track.format !== 'WAV') return false;
      if (activeFormatFilter === 'DSD' && track.format !== 'DSD') return false;
      if (activeFormatFilter === 'HI-RES' && !track.sampleRate.includes('192') && !track.sampleRate.includes('5.6M')) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        track.title.toLowerCase().includes(q) ||
        track.artist.toLowerCase().includes(q) ||
        track.album.toLowerCase().includes(q) ||
        track.format.toLowerCase().includes(q)
      );
    });
  }, [searchQuery, activeFormatFilter]);

  const selectedPlaylist = playlists.find((playlist) => playlist.id === selectedPlaylistId) ?? null;
  const displayedTracks = selectedPlaylist
    ? filteredTracks.filter((track) => (selectedPlaylist.trackIds ?? []).includes(track.id))
    : filteredTracks;

  const handleSync = () => {
    setIsSyncing(true);
    setTimeout(() => {
      setIsSyncing(false);
      setSyncToast('Daftar demo diperbarui. Pemindaian folder asli belum tersedia di preview web.');
      setTimeout(() => setSyncToast(null), 3000);
    }, 600);
  };

  const handleAddToPlaylist = (playlistId: string, track: Track) => {
    const target = playlists.find((playlist) => playlist.id === playlistId);
    if (!target) return;
    const currentTrackIds = target.trackIds ?? [];
    if (currentTrackIds.includes(track.id)) {
      setSyncToast('Lagu ini sudah ada di playlist tersebut.');
      setTrackToAdd(null);
      setTimeout(() => setSyncToast(null), 3000);
      return;
    }
    const nextTrackIds = [...currentTrackIds, track.id];
    setPlaylists((prev) => prev.map((playlist) => playlist.id === playlistId
      ? { ...playlist, trackIds: nextTrackIds, trackCount: nextTrackIds.length, subtitle: `${nextTrackIds.length} lagu` }
      : playlist
    ));
    setSelectedPlaylistId(playlistId);
    setTrackToAdd(null);
    setSyncToast('Lagu ditambahkan ke playlist.');
    setTimeout(() => setSyncToast(null), 3000);
  };

  const handleSavePlaylist = () => {
    const title = playlistName.trim();
    if (!title) {
      setSyncToast('Nama playlist tidak boleh kosong.');
      return;
    }
    const duplicateName = playlists.some((playlist) =>
      playlist.title.toLocaleLowerCase() === title.toLocaleLowerCase() &&
      playlist.id !== playlistEditor?.id
    );
    if (duplicateName) {
      setSyncToast('Nama playlist tersebut sudah digunakan.');
      return;
    }

    if (playlistEditor) {
      setPlaylists((prev) => prev.map((playlist) =>
        playlist.id === playlistEditor.id ? { ...playlist, title } : playlist
      ));
    } else {
      const newPlaylist: Playlist = {
        id: `playlist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title,
        trackCount: 0,
        trackIds: [],
        subtitle: '0 lagu',
      };
      setPlaylists((prev) => [...prev, newPlaylist]);
      setSelectedPlaylistId(newPlaylist.id);
    }
    setPlaylistEditor(null);
    setIsPlaylistEditorOpen(false);
    setPlaylistName('');
    setSyncToast(playlistEditor ? 'Nama playlist diperbarui.' : 'Playlist berhasil dibuat.');
    setTimeout(() => setSyncToast(null), 3000);
  };

  const handleDeletePlaylist = () => {
    if (!playlistToDelete) return;
    setPlaylists((prev) => prev.filter((playlist) => playlist.id !== playlistToDelete.id));
    if (selectedPlaylistId === playlistToDelete.id) setSelectedPlaylistId(null);
    setSyncToast(`Playlist "${playlistToDelete.title}" dihapus.`);
    setPlaylistToDelete(null);
    setTimeout(() => setSyncToast(null), 3000);
  };

  return (
    <div className="flex flex-col w-full gap-4 pb-8">
      {/* Toast Notification */}
      {syncToast && (
        <div className="bg-primary text-on-primary p-3 shadow-md flex items-center justify-between font-label text-xs uppercase animate-fade-in border border-outline">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary-container text-base">check_circle</span>
            <span>{syncToast}</span>
          </div>
          <button onClick={() => setSyncToast(null)} className="text-surface-dim hover:text-white cursor-pointer">
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      )}

      {/* Primary Clean Search & Filter Header */}
      <div className="flex flex-col gap-3 bg-surface-bright p-4 shadow-sm border-2 border-outline">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Main Search Input */}
          <div className="relative min-w-0 w-full flex-1 md:min-w-[340px]">
            <div className="relative flex items-center bg-surface-container-lowest border-2 border-outline shadow-[2px_2px_0px_#1a1a1a]">
              <span className="material-symbols-outlined absolute left-3 text-on-surface-variant text-[20px]">
                search
              </span>
              <input
                id="audio-search"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari lagu, musisi, album, atau format..."
                className="w-full pl-10 pr-24 py-2.5 bg-transparent font-headline text-xs font-semibold text-on-surface placeholder:text-on-surface-variant focus:outline-none"
              />
              {searchQuery ? (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 text-[10px] font-mono font-bold bg-surface-container px-1.5 py-0.5 border border-outline hover:bg-secondary hover:text-white cursor-pointer"
                >
                  CLEAR
                </button>
              ) : (
                <span className="absolute right-3 py-0.5 px-2 bg-surface-container font-mono text-[10px] font-bold text-on-surface-variant uppercase border border-outline/20">
                  Ctrl+K
                </span>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <button
              onClick={handleSync}
              className="flex flex-1 items-center justify-center gap-1.5 px-3 py-2 bg-surface-container hover:bg-surface-container-high text-xs font-label font-bold uppercase text-on-surface border border-outline cursor-pointer transition-colors shadow-[1px_1px_0px_#1a1a1a] sm:flex-none"
              title="Simulasikan pembaruan daftar demo"
            >
              <span className={`material-symbols-outlined text-[16px] text-tertiary ${isSyncing ? 'animate-spin' : ''}`}>
                sync
              </span>
              <span>{isSyncing ? 'Memindai...' : 'Pindai Ulang'}</span>
            </button>

            <button
              onClick={() => setShowAddFolderModal(true)}
              className="flex flex-1 items-center justify-center gap-1.5 px-3 py-2 bg-primary-container text-on-primary-container font-headline text-xs font-bold uppercase tracking-wider hover:bg-primary hover:text-on-primary transition-colors shadow-[2px_2px_0px_#1a1a1a] cursor-pointer border-2 border-outline sm:flex-none"
            >
              <span className="material-symbols-outlined text-[18px]">create_new_folder</span>
              <span>Tambah Folder</span>
            </button>
          </div>
        </div>

        {/* Clean Format Filter Chips */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-outline/10">
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            {filterChips.map((chip) => {
              const active = activeFormatFilter === chip.id;
              return (
                <button
                  key={chip.id}
                  onClick={() => setActiveFormatFilter(chip.id)}
                  className={`px-3 py-1 font-label text-xs font-bold uppercase transition-all shadow-[1px_1px_0px_#1a1a1a] border border-outline cursor-pointer ${
                    active
                      ? 'bg-primary text-on-primary'
                      : 'bg-surface-container-high text-on-surface hover:bg-primary-container hover:text-on-primary-container'
                  }`}
                >
                  {chip.label}
                </button>
              );
            })}
          </div>

          {/* Toggle for Advanced / Optional Details */}
          <button
            onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
            className="flex items-center gap-1 text-[11px] font-label font-bold uppercase text-on-surface-variant hover:text-primary transition-colors cursor-pointer px-2 py-1 bg-surface-container-low border border-outline/30"
          >
            <span className="material-symbols-outlined text-sm text-tertiary">tune</span>
            <span>{showAdvancedOptions ? 'Sembunyikan Opsi Teknis' : 'Opsi Penyimpanan Lanjutan'}</span>
            <span className="material-symbols-outlined text-sm">
              {showAdvancedOptions ? 'expand_less' : 'expand_more'}
            </span>
          </button>
        </div>
      </div>

      {/* Advanced scanning status */}
      {showAdvancedOptions && (
        <section className="rounded-xl border border-outline/15 bg-surface-bright p-3 text-sm sm:p-4">
          <h2 className="font-headline text-sm font-bold text-on-surface">Status Library Preview</h2>
          <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">
            Pemindaian folder lokal, pembacaan metadata, checksum, dan database SQLite native belum terhubung. Daftar lagu saat ini menggunakan data contoh; tidak ada klaim indeks atau audit penyimpanan yang dijalankan.
          </p>
        </section>
      )}

      {/* Main Vault Track List & Playlists */}
      <div className="grid grid-cols-12 gap-5 items-start">
        {/* Playlists Quick Shelf */}
        <div className="col-span-12 lg:col-span-3 flex flex-col gap-3">
          <div className="bg-surface-bright p-3.5 shadow-sm flex flex-col gap-2.5 border-2 border-outline">
            <div className="flex items-center justify-between pb-1.5 border-b border-outline/20">
              <span className="font-headline font-bold text-xs uppercase tracking-wider text-on-surface">
                Daftar Putar (Playlist)
              </span>
              <span className="text-[10px] font-mono font-bold text-tertiary">CEPAT</span>
            </div>

            <div className="flex flex-col gap-1.5">
              {playlists.map((pl) => (
                <div
                  key={pl.id}
                  onClick={() => setSelectedPlaylistId(pl.id)}
                  className={`p-2.5 transition-all border border-outline ${
                    selectedPlaylistId === pl.id
                      ? 'bg-primary-container text-on-primary-container shadow-[2px_2px_0px_#1a1a1a]'
                      : 'bg-surface hover:bg-surface-container-high text-on-surface shadow-[1px_1px_0px_#1a1a1a]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedPlaylistId(pl.id)}
                      className="flex items-center gap-1.5 min-w-0 text-left flex-1"
                      aria-pressed={selectedPlaylistId === pl.id}
                      title={`Pilih playlist ${pl.title}`}
                    >
                      <span className="material-symbols-outlined text-[18px]">
                        {pl.isDropZone ? 'queue_music' : 'album'}
                      </span>
                      <span className="font-headline font-bold text-xs uppercase truncate">{pl.title}</span>
                    </button>
                    <span className="font-mono text-[10px] font-bold shrink-0">{(pl.trackIds ?? []).length}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setPlaylistEditor(pl);
                        setPlaylistName(pl.title);
                        setIsPlaylistEditorOpen(true);
                      }}
                      className="flex-1 px-2 py-1 text-[10px] font-bold uppercase border border-outline/40 hover:bg-surface-container"
                      aria-label={`Edit playlist ${pl.title}`}
                    >
                      Edit nama
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setPlaylistToDelete(pl);
                      }}
                      className="px-2 py-1 text-[10px] font-bold uppercase border border-outline/40 hover:bg-secondary hover:text-white"
                      aria-label={`Hapus playlist ${pl.title}`}
                    >
                      Hapus
                    </button>
                  </div>
                </div>
              ))}

              <button
                onClick={() => {
                  setPlaylistEditor(null);
                  setPlaylistName('');
                  setIsPlaylistEditorOpen(true);
                }}
                className="w-full py-2 px-2.5 bg-surface-container hover:bg-surface-container-high text-on-surface font-headline text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors border border-outline cursor-pointer mt-1"
              >
                <span className="material-symbols-outlined text-[16px]">add</span>
                <span>+ Buat Playlist Baru</span>
              </button>
            </div>
          </div>
        </div>

        {/* Track List Table / Cards */}
        <div className="col-span-12 lg:col-span-9 flex flex-col gap-3">
          <div className="bg-surface-bright p-3 shadow-sm flex items-center justify-between border-2 border-outline">
            <div className="flex items-center gap-2.5">
              <span className="font-headline font-bold text-sm uppercase tracking-tight text-on-surface">
                {selectedPlaylist ? `Playlist: ${selectedPlaylist.title}` : 'Daftar Koleksi Lagu'}
              </span>
              <span className="px-2 py-0.5 bg-primary text-on-primary font-mono text-[10px] font-bold">
                {displayedTracks.length} Lagu Ditampilkan
              </span>
              {selectedPlaylist && <button type="button" onClick={() => setSelectedPlaylistId(null)} className="px-2 py-1 border border-outline text-[10px] font-bold uppercase hover:bg-surface-container">Semua lagu</button>}
            </div>
            <span className="text-xs font-mono text-on-surface-variant hidden sm:inline">
              Klik baris lagu untuk langsung memutar
            </span>
          </div>

          <div className="flex flex-col gap-2 md:hidden">
            {displayedTracks.length === 0 ? (
              <div className="rounded-xl border border-outline/15 bg-surface-bright px-4 py-10 text-center text-sm text-on-surface-variant">
                {selectedPlaylist ? 'Playlist ini belum memiliki lagu.' : 'Tidak ada lagu yang cocok dengan pencarian atau filter.'}
              </div>
            ) : displayedTracks.map((track) => (
              <article key={track.id} className="rounded-xl border border-outline/15 bg-surface-bright p-3 shadow-sm">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="break-words text-sm font-bold leading-snug text-on-surface">{track.title}</h3>
                    <p className="mt-1 break-words text-xs font-medium text-on-surface-variant">{track.artist}</p>
                    <p className="mt-0.5 break-words text-[11px] text-on-surface-variant">{track.album}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="rounded-md bg-primary-container px-2 py-1 text-[10px] font-bold text-on-primary-container">{track.format}</span>
                      <span className="rounded-md bg-surface-container px-2 py-1 font-mono text-[10px] text-on-surface">{track.sampleRate} · {track.bitDepth}</span>
                      <span className="rounded-md bg-surface-container px-2 py-1 font-mono text-[10px] text-on-surface">{track.durationFormatted}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => setTrackToAdd(track)}
                      aria-label={'Tambahkan ' + track.title + ' ke playlist'}
                      title="Tambahkan ke playlist"
                      className="flex h-10 w-10 items-center justify-center rounded-lg border border-outline/15 text-on-surface hover:bg-surface-container"
                    >
                      <span className="material-symbols-outlined text-xl">playlist_add</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onPlayTrack(track)}
                      aria-label={'Putar ' + track.title}
                      title="Putar"
                      className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-on-primary"
                    >
                      <span className="material-symbols-outlined text-xl">play_arrow</span>
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>

          <div className="hidden overflow-hidden rounded-xl border border-outline/15 bg-surface-bright shadow-sm md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse select-none">
                <thead>
                  <tr className="bg-surface-container text-[11px] font-headline font-bold uppercase tracking-wider text-on-surface border-b-2 border-outline">
                    <th className="py-2.5 px-3 w-12 text-center">#</th>
                    <th className="py-2.5 px-3">Judul Lagu</th>
                    <th className="py-2.5 px-3">Artis</th>
                    <th className="py-2.5 px-3 hidden md:table-cell">Album</th>
                    <th className="py-2.5 px-3">Format</th>
                    <th className="py-2.5 px-3 hidden sm:table-cell">Bitrate</th>
                    <th className="py-2.5 px-3 text-right">Durasi</th>
                    <th className="py-2.5 px-3 text-center">Playlist</th>
                    <th className="py-2.5 px-3 text-center">Putar</th>
                  </tr>
                </thead>
                <tbody className="divide-y-0 text-xs font-body">
                  {displayedTracks.length === 0 ? (
                    <tr><td colSpan={9} className="px-4 py-10 text-center text-sm text-on-surface-variant">{selectedPlaylist ? 'Playlist ini belum memiliki lagu. Pilih “Semua lagu” untuk menambahkan lagu.' : 'Tidak ada lagu yang cocok dengan pencarian atau filter.'}</td></tr>
                  ) : displayedTracks.map((track) => {
                    const isTrackActive = currentTrack?.id === track.id;
                    const isTrack2Special = track.id === 'track-02' && !swipedItemRestored;

                    if (isTrack2Special) {
                      return (
                        <tr
                          key={track.id}
                          className="bg-primary-container/30 relative border-b border-outline"
                        >
                          <td className="py-3 px-3 text-center font-mono font-bold text-tertiary">
                            <span className="material-symbols-outlined text-[18px]">drag_indicator</span>
                          </td>
                          <td className="py-3 px-3" colSpan={4}>
                            <div className="flex items-center gap-3">
                              <div className="w-2.5 h-2.5 bg-secondary animate-ping rounded-full shrink-0"></div>
                              <div className="flex flex-col min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-headline font-bold text-sm text-on-surface truncate">
                                    {track.title}
                                  </span>
                                  <span className="px-1.5 py-0.2 bg-secondary text-on-secondary font-mono text-[9px] font-bold uppercase shrink-0">
                                    {track.badge}
                                  </span>
                                </div>
                                <span className="font-mono text-[11px] text-on-surface-variant truncate">
                                  {track.artist} • {track.album}
                                </span>
                              </div>
                              <div className="ml-auto flex items-center gap-2 px-2.5 py-1 bg-primary text-on-primary font-headline text-xs font-bold uppercase shadow-sm shrink-0">
                                <span className="hidden sm:inline">Disematkan di Ref. Vol. 1</span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSwipedItemRestored(true);
                                  }}
                                  className="px-1.5 py-0.5 bg-secondary text-on-secondary text-[10px] font-mono uppercase hover:bg-surface-bright hover:text-on-surface transition-colors cursor-pointer"
                                >
                                  Batal
                                </button>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-3 font-mono text-[11px] text-on-surface hidden sm:table-cell">
                            {track.bitrate}
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-bold text-on-surface">
                            {track.durationFormatted}
                          </td>
                          <td className="py-3 px-3 text-center">
                            <button
                              onClick={(event) => {
                                event.stopPropagation();
                                setTrackToAdd(track);
                              }}
                              className="w-7 h-7 border border-outline hover:bg-primary hover:text-white"
                              title={`Tambahkan ${track.title} ke playlist`}
                              aria-label={`Tambahkan ${track.title} ke playlist`}
                            >
                              <span className="material-symbols-outlined text-[16px]">playlist_add</span>
                            </button>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <button
                              onClick={() => onPlayTrack(track)}
                              className="w-7 h-7 bg-primary text-primary-container hover:bg-secondary hover:text-white flex items-center justify-center transition-colors cursor-pointer mx-auto shadow-sm"
                              title="Putar Langsung"
                            >
                              <span className="material-symbols-outlined text-[16px]">play_arrow</span>
                            </button>
                          </td>
                        </tr>
                      );
                    }

                    return (
                      <tr
                        key={track.id}
                        onClick={() => onPlayTrack(track)}
                        className={`transition-colors cursor-pointer border-b border-outline/15 ${
                          isTrackActive
                            ? 'bg-primary-container/40 font-semibold'
                            : 'bg-surface-container-lowest hover:bg-surface-container-high'
                        }`}
                      >
                        <td className="py-3 px-3 text-center font-mono font-bold text-on-surface-variant">
                          {isTrackActive && isPlaying ? (
                            <span className="material-symbols-outlined text-[15px] text-tertiary animate-pulse">
                              volume_up
                            </span>
                          ) : (
                            track.trackNumber
                          )}
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`font-headline font-bold text-on-surface tracking-tight ${
                                isTrackActive ? 'text-tertiary' : ''
                              }`}
                            >
                              {track.title}
                            </span>
                            {track.badge && (
                              <span className="px-1.5 py-0.2 bg-primary-container text-on-primary-container font-mono text-[9px] font-bold shrink-0">
                                {track.badge}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3 font-semibold text-on-surface truncate max-w-[140px]">
                          {track.artist}
                        </td>
                        <td className="py-3 px-3 text-on-surface-variant italic truncate max-w-[160px] hidden md:table-cell">
                          {track.album}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span className="px-2 py-0.5 bg-surface-container-high font-mono text-[10px] font-bold text-tertiary border border-outline/20">
                            {track.format} {track.sampleRate.replace('kHz', '')}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-mono text-[11px] text-on-surface whitespace-nowrap hidden sm:table-cell">
                          {track.bitrate}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-on-surface whitespace-nowrap">
                          {track.durationFormatted}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <button
                            aria-label={`Tambahkan ${track.title} ke playlist`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setTrackToAdd(track);
                            }}
                            className="w-7 h-7 border border-outline hover:bg-primary hover:text-white"
                            title={`Tambahkan ${track.title} ke playlist`}
                          >
                            <span className="material-symbols-outlined text-[16px]">playlist_add</span>
                          </button>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <button
                            aria-label={`Putar ${track.title}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onPlayTrack(track);
                            }}
                            className="w-7 h-7 bg-surface-container hover:bg-primary hover:text-white flex items-center justify-center transition-colors cursor-pointer mx-auto border border-outline"
                            title="Putar Langsung"
                          >
                            <span className="material-symbols-outlined text-[16px]">play_arrow</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Quick Filter by letter */}
            <div className="p-2.5 bg-surface-container flex flex-wrap items-center justify-between text-xs font-mono gap-2 border-t border-outline">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-bold text-on-surface text-[11px]">Lompat ke huruf:</span>
                <div className="flex gap-1 text-[10px] font-bold text-on-surface-variant flex-wrap">
                  {['A', 'B', 'C', 'D', 'E', 'M', 'S', 'T', 'Z'].map((letter) => (
                    <button
                      key={letter}
                      onClick={() => setSearchQuery(letter)}
                      className="px-1.5 py-0.5 bg-surface border border-outline/30 hover:bg-primary hover:text-white cursor-pointer"
                    >
                      {letter}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 text-[10px]">
                <span className="font-bold text-primary bg-primary-container px-1.5 py-0.5 border border-outline">
                  Preview · Demo Data
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>


      {trackToAdd && (
        <div className="fixed inset-0 bg-primary/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Tambahkan lagu ke playlist">
          <div className="bg-surface-bright border-2 border-outline shadow-[6px_6px_0px_#1a1a1a] p-5 max-w-md w-full flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3 border-b-2 border-outline pb-2">
              <div>
                <h3 className="font-headline font-bold text-base uppercase">Tambahkan ke playlist</h3>
                <p className="text-xs text-on-surface-variant mt-1">{trackToAdd.title} — {trackToAdd.artist}</p>
              </div>
              <button type="button" onClick={() => setTrackToAdd(null)} aria-label="Tutup" className="p-1 hover:bg-surface-container">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            {playlists.length === 0 ? (
              <p className="text-sm text-on-surface-variant">Belum ada playlist. Buat playlist terlebih dahulu.</p>
            ) : (
              <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
                {playlists.map((playlist) => {
                  const alreadyAdded = (playlist.trackIds ?? []).includes(trackToAdd.id);
                  return (
                    <button
                      key={playlist.id}
                      type="button"
                      disabled={alreadyAdded}
                      onClick={() => handleAddToPlaylist(playlist.id, trackToAdd)}
                      className="flex items-center justify-between gap-3 px-3 py-2 border border-outline text-left hover:bg-primary-container disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      <span className="text-sm font-semibold">{playlist.title}</span>
                      <span className="text-xs font-mono">{alreadyAdded ? 'Sudah ada' : `${(playlist.trackIds ?? []).length} lagu · Tambahkan`}</span>
                    </button>
                  );
                })}
              </div>
            )}
            <div className="flex justify-end">
              <button type="button" onClick={() => setTrackToAdd(null)} className="px-4 py-2 border border-outline text-xs font-bold uppercase">Tutup</button>
            </div>
          </div>
        </div>
      )}

      {isPlaylistEditorOpen ? (
        <div className="fixed inset-0 bg-primary/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Edit playlist">
          <form
            className="bg-surface-bright border-2 border-outline shadow-[6px_6px_0px_#1a1a1a] p-5 max-w-md w-full flex flex-col gap-4"
            onSubmit={(event) => { event.preventDefault(); handleSavePlaylist(); }}
          >
            <h3 className="font-headline font-bold text-base uppercase">{playlistEditor ? 'Edit nama playlist' : 'Buat playlist baru'}</h3>
            <label className="text-xs font-bold" htmlFor="playlist-name">Nama playlist</label>
            <input id="playlist-name" autoFocus value={playlistName} onChange={(event) => setPlaylistName(event.target.value)} maxLength={80} className="w-full bg-surface-container px-3 py-2 text-sm border-2 border-outline" placeholder="Contoh: Jazz Malam" />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { setPlaylistEditor(null); setPlaylistName(''); setIsPlaylistEditorOpen(false); }} className="px-4 py-2 border border-outline text-xs font-bold uppercase">Batal</button>
              <button type="submit" className="px-4 py-2 bg-primary text-on-primary border border-outline text-xs font-bold uppercase">Simpan</button>
            </div>
          </form>
        </div>
      ) : null}

      {playlistToDelete && (
        <div className="fixed inset-0 bg-primary/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Konfirmasi hapus playlist">
          <div className="bg-surface-bright border-2 border-outline p-5 max-w-md w-full flex flex-col gap-3">
            <h3 className="font-headline font-bold text-base uppercase">Hapus playlist?</h3>
            <p className="text-sm text-on-surface-variant">Playlist "{playlistToDelete.title}" akan dihapus. File musik tidak akan dihapus.</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setPlaylistToDelete(null)} className="px-4 py-2 border border-outline text-xs font-bold uppercase">Batal</button>
              <button type="button" onClick={handleDeletePlaylist} className="px-4 py-2 bg-secondary text-white border border-outline text-xs font-bold uppercase">Hapus playlist</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Add Folder */}
      {showAddFolderModal && (
        <div className="fixed inset-0 bg-primary/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface-bright border-2 border-outline shadow-[6px_6px_0px_#1a1a1a] p-6 max-w-lg w-full flex flex-col gap-4">
            <div className="flex items-center justify-between border-b-2 border-outline pb-2">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-tertiary text-2xl">create_new_folder</span>
                <h3 className="font-headline font-bold text-base uppercase">Pilih Folder Musik Lokal</h3>
              </div>
              <button onClick={() => setShowAddFolderModal(false)} className="p-1 hover:bg-surface-container cursor-pointer">
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>
            <p className="text-xs text-on-surface-variant font-body leading-relaxed">
              Ini adalah preview antarmuka. Pemilihan folder, pemindaian file, dan penyimpanan database native belum diimplementasikan pada versi web ini.
            </p>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-label font-bold uppercase text-on-surface-variant">Status folder musik</label>
              <input
                type="text"
                defaultValue="D:\Music\Lossless_Masters_2024"
                className="w-full bg-surface-container px-3 py-2 text-xs font-mono border-2 border-outline focus:outline-none focus:bg-primary-container"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowAddFolderModal(false)}
                className="px-4 py-2 bg-surface-container text-on-surface font-headline font-bold text-xs uppercase border border-outline cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={() => {
                  setShowAddFolderModal(false);
                }}
                className="px-4 py-2 bg-primary text-on-primary font-headline font-bold text-xs uppercase hover:bg-primary-container hover:text-on-primary-container transition-colors cursor-pointer border border-outline"
              >
                Mulai Indeks
              </button>
            </div>
          </div>
        </div>
      )}


    </div>
  );
};
