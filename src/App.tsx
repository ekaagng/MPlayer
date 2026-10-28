import React, { useState, useEffect, useCallback } from 'react';
import { AppView, Track, EqualizerState, OutputSettings } from './types/audio';
import { MOCK_TRACKS } from './data/mockTracks';
import { audioEngine } from './services/audioEngine';
import { Header } from './components/Header';
import { LibraryView } from './views/LibraryView';
import { NowPlayingView } from './views/NowPlayingView';
import { EqualizerView } from './views/EqualizerView';
import { LyricsView } from './views/LyricsView';
import { OutputSettingsView } from './views/OutputSettingsView';

export default function App() {
  const [currentView, setCurrentView] = useState<AppView>('now-playing-and-signal-path');
  const [currentTrack, setCurrentTrack] = useState<Track | null>(MOCK_TRACKS[1] ?? null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
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
    const unsubscribeTelemetry = audioEngine.subscribeTelemetry((telemetry) => {
      if (audioEngine.isCurrentlyPlaying()) setCurrentTimeMs(telemetry.currentTimeMs);
    });
    const unsubscribeEnd = audioEngine.subscribeTrackEnd(() => setIsPlaying(false));
    return () => {
      unsubscribeTelemetry();
      unsubscribeEnd();
    };
  }, []);

  const handleUpdateEq = useCallback((newEq: EqualizerState) => {
    setEqState(newEq);
    audioEngine.setEqualizer(newEq);
  }, []);

  const handlePlayTrack = async (track: Track) => {
    setCurrentTrack(track);
    setCurrentTimeMs(0);
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
      await audioEngine.playTrack(currentTrack, currentTimeMs);
      setIsPlaying(true);
    } catch (error) {
      setIsPlaying(false);
      setPlaybackError(error instanceof Error ? error.message : 'Audio tidak dapat diputar pada preview ini.');
    }
  };

  const handlePrevTrack = () => {
    if (MOCK_TRACKS.length === 0 || !currentTrack) return;
    const currentIndex = MOCK_TRACKS.findIndex((track) => track.id === currentTrack.id);
    const previousIndex = currentIndex > 0 ? currentIndex - 1 : MOCK_TRACKS.length - 1;
    void handlePlayTrack(MOCK_TRACKS[previousIndex]);
  };

  const handleNextTrack = () => {
    if (MOCK_TRACKS.length === 0 || !currentTrack) return;
    const currentIndex = MOCK_TRACKS.findIndex((track) => track.id === currentTrack.id);
    const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % MOCK_TRACKS.length;
    void handlePlayTrack(MOCK_TRACKS[nextIndex]);
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
            onPlayTrack={(track) => { void handlePlayTrack(track); }}
          />
        )}

        {currentView === 'now-playing-and-signal-path' && (
          <NowPlayingView
            currentTrack={currentTrack}
            isPlaying={isPlaying}
            currentTimeMs={currentTimeMs}
            playbackError={playbackError}
            onTogglePlay={handleTogglePlay}
            onPrev={handlePrevTrack}
            onNext={handleNextTrack}
            onSeek={handleSeek}
          />
        )}

        {currentView === 'equalizer-and-dsp' && (
          <EqualizerView eqState={eqState} onUpdateEq={handleUpdateEq} />
        )}

        {currentView === 'lyrics-editor' && (
          <LyricsView
            currentTrack={currentTrack}
            currentTimeMs={currentTimeMs}
            onSeek={handleSeek}
            onPlayTrack={(track) => { void handlePlayTrack(track); }}
          />
        )}

        {currentView === 'audio-output-settings' && (
          <OutputSettingsView
            settings={outputSettings}
            onUpdateSettings={setOutputSettings}
            isBitPerfect={false}
          />
        )}
      </main>
    </div>
  );
}
