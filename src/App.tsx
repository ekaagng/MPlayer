import React, { useState, useEffect, useCallback } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { AppView, Track, EqualizerState, OutputSettings } from './types/audio';
import { MOCK_TRACKS } from './data/mockTracks';
import { audioEngine } from './services/audioEngine';
import { EQ_FREQUENCY_KEYS, getNativeEqualizer, getNativeRuntimeInfo, listNativeTracks, toAppTrack } from './services/nativeBridge';
import { Header } from './components/Header';
import { LibraryView } from './views/LibraryView';
import { NowPlayingView } from './views/NowPlayingView';
import { EqualizerView } from './views/EqualizerView';
import { LyricsView } from './views/LyricsView';
import { OutputSettingsView } from './views/OutputSettingsView';

export default function App() {
  const [currentView, setCurrentView] = useState<AppView>('now-playing-and-signal-path');
  const [currentTrack, setCurrentTrack] = useState<Track | null>(() => isTauri() ? null : (MOCK_TRACKS[1] ?? null));
  const [nativeTracks, setNativeTracks] = useState<Track[]>([]);
  const [playQueue, setPlayQueue] = useState<Track[]>(() => isTauri() ? [] : MOCK_TRACKS);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [currentDurationMs, setCurrentDurationMs] = useState(0);
  const [isNativeRuntime, setIsNativeRuntime] = useState(() => isTauri());
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  const [eqState, setEqState] = useState<EqualizerState>({
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
  });

  const [outputSettings, setOutputSettings] = useState<OutputSettings>({
    activeDevice: 'topping',
    wasapiMode: 'exclusive',
    bufferIndex: 1,
    bufferSamples: 128,
    latencyMs: 2.6,
    gracefulFallback: true,
    forceResample: false,
  });

  useEffect(() => {
    let mounted = true;
    const unsubscribeTelemetry = audioEngine.subscribeTelemetry((telemetry) => {
      setCurrentDurationMs(telemetry.durationMs);
      setCurrentTimeMs(telemetry.currentTimeMs);
    });
    const unsubscribeEnd = audioEngine.subscribeTrackEnd(() => setIsPlaying(false));

    void getNativeRuntimeInfo().then(async (runtime) => {
      if (!mounted) return;
      setIsNativeRuntime(Boolean(runtime));
      if (runtime) {
        const [files, savedEqualizer] = await Promise.all([
          listNativeTracks(),
          getNativeEqualizer(),
        ]);
        if (!mounted) return;
        const tracks = files.map((file, index) => toAppTrack(file, index));
        const restoredBands = { ...eqState.bands };
        EQ_FREQUENCY_KEYS.forEach((frequency, index) => {
          const value = savedEqualizer.bandsDb[index];
          if (typeof value === 'number' && Number.isFinite(value)) {
            restoredBands[frequency] = value;
          }
        });
        const restoredEqualizer: EqualizerState = {
          ...eqState,
          enabled: savedEqualizer.enabled,
          preamp: savedEqualizer.preampDb,
          autoPreamp: savedEqualizer.autoPreamp,
          bands: restoredBands,
          preset: 'custom',
        };
        setEqState(restoredEqualizer);
        audioEngine.setEqualizer(restoredEqualizer);
        setNativeTracks(tracks);
        setPlayQueue(tracks);
        setCurrentTrack(tracks[0] ?? null);
      }
    }).catch((error: unknown) => {
      console.error('[MPlayer] Native runtime initialization failed:', error);
    });

    return () => {
      mounted = false;
      unsubscribeTelemetry();
      unsubscribeEnd();
    };
  }, []);

  const handleUpdateEq = useCallback((newEq: EqualizerState) => {
    setEqState(newEq);
    audioEngine.setEqualizer(newEq);
  }, []);

  const handlePlayTrack = async (track: Track, queue?: Track[]) => {
    if (queue && queue.length > 0) setPlayQueue(queue);
    setCurrentTrack(track);
    setCurrentTimeMs(0);
    setCurrentDurationMs(0);
    setPlaybackError(null);
    try {
      await audioEngine.playTrack(track, 0);
      setIsPlaying(true);
    } catch (error) {
      setIsPlaying(false);
      setPlaybackError(error instanceof Error ? error.message : 'Audio tidak dapat diputar pada preview ini.');
    }
  };

  const handleTogglePlay = async () => {
    if (isPlaying) {
      audioEngine.pause();
      setIsPlaying(false);
      return;
    }
    if (!currentTrack) return;

    setPlaybackError(null);
    try {
      const startFromMs = currentDurationMs > 0 && currentTimeMs >= currentDurationMs
        ? 0
        : currentTimeMs;
      await audioEngine.playTrack(currentTrack, startFromMs);
      setIsPlaying(true);
    } catch (error) {
      setIsPlaying(false);
      setPlaybackError(error instanceof Error ? error.message : 'Audio tidak dapat diputar pada preview ini.');
    }
  };

  const handleNativeTracksChange = useCallback((tracks: Track[]) => {
    setNativeTracks(tracks);
    setPlayQueue(tracks);
  }, []);

  useEffect(() => {
    if (!isNativeRuntime || !currentTrack?.id.startsWith('native-')) return;
    const stillIndexed = nativeTracks.some((track) => track.id === currentTrack.id);
    if (!stillIndexed) {
      audioEngine.stop();
      setCurrentTrack(null);
      setIsPlaying(false);
      setCurrentTimeMs(0);
      setCurrentDurationMs(0);
    }
  }, [isNativeRuntime, currentTrack, nativeTracks]);

  const handlePrevTrack = () => {
    const tracks = playQueue;
    if (tracks.length === 0 || !currentTrack) return;
    const currentIndex = tracks.findIndex((track) => track.id === currentTrack.id);
    const previousIndex = currentIndex < 0 ? tracks.length - 1 : (currentIndex > 0 ? currentIndex - 1 : tracks.length - 1);
    void handlePlayTrack(tracks[previousIndex]);
  };

  const handleNextTrack = () => {
    const tracks = getActiveTrackList();
    if (tracks.length === 0 || !currentTrack) return;
    const currentIndex = tracks.findIndex((track) => track.id === currentTrack.id);
    const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % tracks.length;
    void handlePlayTrack(tracks[nextIndex]);
  };

  const handleSeek = (milliseconds: number) => {
    const bounded = Math.max(0, milliseconds);
    setCurrentTimeMs(bounded);
    audioEngine.seek(bounded);
  };

  const handleQuickSearch = () => {
    setCurrentView('library-and-tracks');
    window.setTimeout(() => {
      document.getElementById('audio-search')?.focus();
    }, 50);
  };

  useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        handleQuickSearch();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  return (
    <div className="min-h-[100dvh] bg-surface font-body text-on-surface antialiased">
      <Header currentView={currentView} onSelectView={setCurrentView} />
      <main className="mx-auto min-h-[100dvh] w-full max-w-7xl px-3 pb-6 pt-20 sm:px-5 md:px-8">
        {currentView === 'library-and-tracks' && (
          <LibraryView
            currentTrack={currentTrack}
            isPlaying={isPlaying}
            onPlayTrack={(track, queue) => { void handlePlayTrack(track, queue); }}
            onNativeTracksChange={handleNativeTracksChange}
          />
        )}

        {currentView === 'now-playing-and-signal-path' && (
          <NowPlayingView
            currentTrack={currentTrack}
            isPlaying={isPlaying}
            currentTimeMs={currentTimeMs}
            durationMs={currentDurationMs}
            isNativeRuntime={isNativeRuntime}
            canNavigate={!isNativeRuntime || nativeTracks.length > 1}
            playbackError={playbackError}
            onTogglePlay={handleTogglePlay}
            onPrev={handlePrevTrack}
            onNext={handleNextTrack}
            onSeek={handleSeek}
          />
        )}

        {currentView === 'equalizer-and-dsp' && (
          <EqualizerView eqState={eqState} onUpdateEq={handleUpdateEq} isNativeRuntime={isNativeRuntime} />
        )}

        {currentView === 'lyrics-editor' && (
          <LyricsView
            currentTrack={currentTrack}
            currentTimeMs={currentTimeMs}
            onSeek={handleSeek}
            onPlayTrack={(track) => { void handlePlayTrack(track); }}
            isNativeRuntime={isNativeRuntime}
          />
        )}

        {currentView === 'audio-output-settings' && (
          <OutputSettingsView
            settings={outputSettings}
            onUpdateSettings={setOutputSettings}
            isNativeRuntime={isNativeRuntime}
          />
        )}
      </main>
    </div>
  );
}
