# MPlayer

MPlayer is being developed as an offline-first music player. The React/Vite interface is shared with a Tauri 2 application; native capabilities are implemented in Rust rather than simulated by the browser UI.

## Architecture (current stage)

- **UI:** React + TypeScript + Vite.
- **Native host:** Tauri 2 in `src-tauri/`.
- **Native playback (initial):** Rodio/CPAL with Symphonia decoding for formats enabled by the dependency. Playback currently uses the operating system's default output stream.
- **Local library index:** SQLite in the operating system's application data directory. Rust creates the schema on first launch.
- **Desktop library scanning:** The user chooses a folder through a native dialog; Rust recursively indexes supported extensions, skips symbolic links, and caps each scan at 20,000 files.
- **Browser preview:** Web Audio remains the browser-only preview path. It is not a native audio implementation.

## Run the desktop app on Windows

Prerequisites: Node.js LTS, Rust stable using the MSVC toolchain, Microsoft C++ Build Tools with **Desktop development with C++**, and the WebView2 Runtime.

From the repository root in PowerShell:

```powershell
npm install
npm run tauri:dev
```

To build a native executable locally:

```powershell
npm run tauri:build
```

The installer/bundle is intentionally disabled while the native shell is being validated. The immediate goal is a working development build first; app icons, signing, installer packaging, and release automation are separate tasks.

## Mobile target preparation

Tauri requires the Android SDK/NDK and Java toolchain for Android. iOS builds require macOS with Xcode. After those prerequisites are installed:

```powershell
npm run android:init
npm run android:dev
```

On macOS:

```sh
npm run ios:init
npm run ios:dev
```

Mobile targets still need device/emulator verification. The current folder scanner uses a desktop folder picker; Android Storage Access Framework and iOS Files document-picker flows are not wired yet. Background playback, lock-screen/media-session controls, mobile lifecycle behavior, and mobile packaging/signing are also not yet verified.

## Known limitations — do not treat these as implemented

- Audio is routed through the default OS output. **WASAPI exclusive mode, device-specific output selection, sample-rate negotiation, bit-perfect output, and output diagnostics are not implemented or verified.**
- The scanner records file paths, filename-derived title, extension, size, and modification time. Embedded tag reading, artwork, accurate duration/bit depth/sample rate metadata, and stale-file reconciliation are pending.
- DSD (`.dsf`/`.dff`) files can be indexed, but the current Rodio/Symphonia decoder does not provide DSD decoding. Do not assume those files will play yet.
- Native DSP/equalizer is not wired to the Rust playback path. The equalizer UI is not proof of active native DSP.
- Playlist state in the current UI still uses browser local storage; SQLite playlist tables are schema foundations only.
- Android/iOS projects have not yet been generated and validated on their respective SDKs/devices.

## Development checks

- `npm run lint` — TypeScript check.
- `npm run test:lrc` — LRC parser unit tests.
- `npm run build` — browser frontend bundle.
- `cargo check --manifest-path src-tauri/Cargo.toml` — native Rust/Tauri compile check (requires Rust and platform build prerequisites).
