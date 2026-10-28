import React, { useState, useEffect, useCallback } from 'react';
import { AppView, Track, EqualizerState, OutputSettings } from './types/audio';
import { MOCK_TRACKS } from './data/mockTracks';
import { audioEngine, AudioTelemetry } from './services/audioEngine';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { BottomPlayer } from './components/BottomPlayer';
import { MobileNavigation } from './components/MobileNavigation';
import { MobileQuickAccessBar } from './components/MobileQuickAccessBar';
import { LibraryView } from './views/LibraryView';
import { NowPlayingView } from './views/NowPlayingView';
import { EqualizerView } from './views/EqualizerView';
import { LyricsView } from './views/LyricsView';
import { OutputSettingsView } from './views/OutputSettingsView';

export default function App() {
  const [currentView, setCurrentView] = useState<AppView>('library-and-tracks');
  const [currentTrack, setCurrentTrack] = useState<Track | null>(MOCK_TRACKS[1]); // Default to Miles Davis "So What"
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeMs, setCurrentTimeMs] = useState(221228);
  const [durationMs, setDurationMs] = useState(562040);
  const [volume, setVolume] = useState(0.85);

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
    bufferIndex: 1, // 128 spl
    bufferSamples: 128,
    latencyMs: 2.6,
    gracefulFallback: true,
    forceResample: false,
  });

  const [telemetry, setTelemetry] = useState<AudioTelemetry>({
    currentTimeMs: 221228,
    durationMs: 562040,
    rmsLeft: -14.2,
    rmsRight: -15.0,
    peakLeft: -0.8,
    peakRight: -1.1,
    frequencyData: new Uint8Array(128),
  });

  const isBitPerfect = !eqState.enabled || eqState.abMode === 'B';

  useEffect(() => {
    const unsubscribe = audioEngine.subscribeTelemetry((t) => {
      setTelemetry(t);
      if (audioEngine.isCurrentlyPlaying()) {
        setCurrentTimeMs(t.currentTimeMs);
        setDurationMs(t.durationMs);
      }
    });

    const unsubscribeEnd = audioEngine.subscribeTrackEnd(() => {
      setIsPlaying(false);
      handleNextTrack();
    });

    return () => {
      unsubscribe();
      unsubscribeEnd();
    };
  }, [currentTrack]);

  const handleUpdateEq = useCallback((newEq: EqualizerState) => {
    setEqState(newEq);
    audioEngine.setEqualizer(newEq);
  }, []);

  const handlePlayTrack = async (track: Track) => {
    setCurrentTrack(track);
    setDurationMs(track.duration * 1000);
    setIsPlaying(true);
    await audioEngine.playTrack(track, 0);
  };

  const handleTogglePlay = async () => {
    if (isPlaying) {
      audioEngine.pause();
      setIsPlaying(false);
    } else {
      if (currentTrack) {
        setIsPlaying(true);
        await audioEngine.playTrack(currentTrack, currentTimeMs);
      } else if (MOCK_TRACKS.length > 0) {
        handlePlayTrack(MOCK_TRACKS[0]);
      }
    }
  };

  const handlePrevTrack = () => {
    if (!currentTrack) return;
    const currentIndex = MOCK_TRACKS.findIndex((t) => t.id === currentTrack.id);
    const prevIndex = currentIndex > 0 ? currentIndex - 1 : MOCK_TRACKS.length - 1;
    handlePlayTrack(MOCK_TRACKS[prevIndex]);
  };

  const handleNextTrack = () => {
    if (!currentTrack) return;
    const currentIndex = MOCK_TRACKS.findIndex((t) => t.id === currentTrack.id);
    const nextIndex = (currentIndex + 1) % MOCK_TRACKS.length;
    handlePlayTrack(MOCK_TRACKS[nextIndex]);
  };

  const handleSeek = (ms: number) => {
    setCurrentTimeMs(ms);
    audioEngine.seek(ms);
  };

  const handleVolumeChange = (vol: number) => {
    setVolume(vol);
    audioEngine.setVolume(vol);
  };

  const handleQuickSearch = () => {
    setCurrentView('library-and-tracks');
    setTimeout(() => {
      const searchInput = document.getElementById('audio-search');
      searchInput?.focus();
    }, 50);
  };

  // Keyboard navigation & search shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        handleQuickSearch();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  const formatHeaderPill = currentTrack
    ? `${outputSettings.wasapiMode === 'exclusive' ? 'WASAPI Exclusive' : 'Shared Mixer'} • ${currentTrack.sampleRate}/${currentTrack.bitDepth}`
    : 'WASAPI Exclusive • 192kHz/24-bit';

  return (
    <div className="bg-surface font-body text-on-surface min-h-screen flex flex-col select-none antialiased">
      {/* Top Application Header */}
      <Header currentTrackFormat={formatHeaderPill} />

      {/* Mobile Quick Access Toggle Bar for instant menu jumping */}
      <MobileQuickAccessBar
        currentView={currentView}
        onSelectView={setCurrentView}
        isPlaying={isPlaying}
        onTogglePlay={handleTogglePlay}
        onQuickSearch={handleQuickSearch}
      />

      {/* Desktop Navigation Sidebar */}
      <Sidebar
        currentView={currentView}
        onSelectView={setCurrentView}
        isPlaying={isPlaying}
        trackCount={18420}
      />

      {/* Main Content Area */}
      <div className="lg:pl-64 flex-1">
        <main className="pt-4 lg:pt-14 pb-28 min-h-screen bg-surface w-full px-3 sm:px-6 lg:px-8 max-w-7xl mx-auto">
          {currentView === 'library-and-tracks' && (
            <LibraryView
              currentTrack={currentTrack}
              isPlaying={isPlaying}
              onPlayTrack={handlePlayTrack}
            />
          )}

          {currentView === 'now-playing-and-signal-path' && (
            <NowPlayingView
              currentTrack={currentTrack}
              isPlaying={isPlaying}
              telemetry={telemetry}
              isBitPerfect={isBitPerfect}
              onTogglePlay={handleTogglePlay}
              onPrev={handlePrevTrack}
              onNext={handleNextTrack}
              onSeek={handleSeek}
            />
          )}

          {currentView === 'equalizer-and-dsp' && (
            <EqualizerView
              eqState={eqState}
              onUpdateEq={handleUpdateEq}
              telemetry={telemetry}
              isPlaying={isPlaying}
            />
          )}

          {currentView === 'lyrics-editor' && (
            <LyricsView
              currentTrack={currentTrack}
              currentTimeMs={currentTimeMs}
              onSeek={handleSeek}
              onPlayTrack={handlePlayTrack}
            />
          )}

          {currentView === 'audio-output-settings' && (
            <OutputSettingsView
              settings={outputSettings}
              onUpdateSettings={setOutputSettings}
              isBitPerfect={isBitPerfect}
            />
          )}
        </main>
      </div>

      {/* Desktop Persistent Bottom Player */}
      <BottomPlayer
        currentTrack={currentTrack}
        isPlaying={isPlaying}
        currentTimeMs={currentTimeMs}
        durationMs={durationMs}
        volume={volume}
        isBitPerfect={isBitPerfect}
        onTogglePlay={handleTogglePlay}
        onPrev={handlePrevTrack}
        onNext={handleNextTrack}
        onSeek={handleSeek}
        onVolumeChange={handleVolumeChange}
        onNavigate={setCurrentView}
      />

      {/* Mobile Bottom Navigation & Floating Mini-Player */}
      <MobileNavigation
        currentView={currentView}
        onSelectView={setCurrentView}
        currentTrack={currentTrack}
        isPlaying={isPlaying}
        onTogglePlay={handleTogglePlay}
        onPrev={handlePrevTrack}
        onNext={handleNextTrack}
      />
    </div>
  );
}
