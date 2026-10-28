use rodio::{Decoder, OutputStream, OutputStreamBuilder, Sink, Source};
use rusqlite::{params, Connection};
use serde::Serialize;
use std::{
    fs::{self, File},
    path::{Path, PathBuf},
    sync::Mutex,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{Manager, State};

const MAX_TRACKS_PER_SCAN: usize = 20_000;
const AUDIO_EXTENSIONS: &[&str] = &[
    "flac", "wav", "mp3", "dsf", "dff", "m4a", "aac", "ogg", "opus", "aiff", "aif",
];

struct AppState {
    database_path: PathBuf,
    playback: Mutex<NativePlayback>,
}

#[derive(Default)]
struct NativePlayback {
    output_stream: Option<OutputStream>,
    sink: Option<Sink>,
    track_path: Option<String>,
    duration_ms: u64,
    volume: f32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeInfo {
    platform: String,
    native_audio: bool,
    folder_scanning: bool,
    database: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeTrack {
    id: i64,
    path: String,
    title: String,
    format: String,
    size_bytes: u64,
    modified_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScanResult {
    tracks: Vec<NativeTrack>,
    truncated: bool,
    scanned_folder: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PlaybackSnapshot {
    path: Option<String>,
    is_playing: bool,
    current_time_ms: u64,
    duration_ms: u64,
    volume: f32,
}

fn initialize_database(path: &Path) -> Result<(), String> {
    let connection = Connection::open(path).map_err(|error| format!("SQLite tidak dapat dibuka: {error}"))?;
    connection
        .execute_batch(
            "
            PRAGMA journal_mode = WAL;
            PRAGMA foreign_keys = ON;
            CREATE TABLE IF NOT EXISTS tracks (
                id INTEGER PRIMARY KEY,
                path TEXT NOT NULL UNIQUE,
                title TEXT NOT NULL,
                format TEXT NOT NULL,
                size_bytes INTEGER NOT NULL CHECK(size_bytes >= 0),
                modified_at INTEGER,
                duration_ms INTEGER,
                artist TEXT,
                album TEXT,
                sample_rate_hz INTEGER,
                bit_depth INTEGER,
                bitrate_bps INTEGER,
                scanned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_tracks_title ON tracks(title COLLATE NOCASE);
            CREATE INDEX IF NOT EXISTS idx_tracks_format ON tracks(format);
            CREATE TABLE IF NOT EXISTS playlists (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS playlist_tracks (
                playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
                track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
                position INTEGER NOT NULL,
                PRIMARY KEY (playlist_id, track_id)
            );
            CREATE TABLE IF NOT EXISTS playback_history (
                id INTEGER PRIMARY KEY,
                track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
                played_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                last_position_ms INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS lyrics (
                track_id INTEGER PRIMARY KEY REFERENCES tracks(id) ON DELETE CASCADE,
                lrc_text TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            ",
        )
        .map_err(|error| format!("Migrasi database gagal: {error}"))?;
    Ok(())
}

fn supported_audio_file(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| AUDIO_EXTENSIONS.iter().any(|allowed| extension.eq_ignore_ascii_case(allowed)))
        .unwrap_or(false)
}

fn file_modified_timestamp(path: &Path) -> Option<i64> {
    let modified = fs::metadata(path).ok()?.modified().ok()?;
    modified.duration_since(UNIX_EPOCH).ok().map(|value| value.as_secs().min(i64::MAX as u64) as i64)
}

fn read_track(row: &rusqlite::Row<'_>) -> rusqlite::Result<NativeTrack> {
    Ok(NativeTrack {
        id: row.get(0)?,
        path: row.get(1)?,
        title: row.get(2)?,
        format: row.get(3)?,
        size_bytes: row.get::<_, i64>(4)?.max(0) as u64,
        modified_at: row.get(5)?,
    })
}

fn list_tracks_from_db(connection: &Connection) -> Result<Vec<NativeTrack>, String> {
    let mut statement = connection
        .prepare("SELECT id, path, title, format, size_bytes, modified_at FROM tracks ORDER BY title COLLATE NOCASE")
        .map_err(|error| format!("Query library gagal: {error}"))?;
    let rows = statement
        .query_map([], read_track)
        .map_err(|error| format!("Membaca library gagal: {error}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Membaca track gagal: {error}"))
}

#[tauri::command]
fn native_runtime_info() -> RuntimeInfo {
    RuntimeInfo {
        platform: std::env::consts::OS.to_string(),
        native_audio: true,
        folder_scanning: !cfg!(any(target_os = "android", target_os = "ios")),
        database: "SQLite lokal".to_string(),
    }
}

#[tauri::command]
fn native_list_tracks(state: State<'_, AppState>) -> Result<Vec<NativeTrack>, String> {
    let connection = Connection::open(&state.database_path)
        .map_err(|error| format!("Database library tidak dapat dibuka: {error}"))?;
    list_tracks_from_db(&connection)
}

#[tauri::command]
fn native_scan_music_directory(path: String, state: State<'_, AppState>) -> Result<ScanResult, String> {
    if cfg!(any(target_os = "android", target_os = "ios")) {
        return Err("Pemilihan folder penuh belum tersedia di Android/iOS. Integrasi document picker mobile diperlukan.".to_string());
    }

    let selected = PathBuf::from(&path);
    if !selected.is_dir() {
        return Err("Folder musik tidak ditemukan atau tidak dapat diakses.".to_string());
    }
    let root = selected.canonicalize().map_err(|error| format!("Folder tidak dapat dibuka: {error}"))?;
    let connection = Connection::open(&state.database_path)
        .map_err(|error| format!("Database library tidak dapat dibuka: {error}"))?;
    let transaction = connection
        .unchecked_transaction()
        .map_err(|error| format!("Transaksi database gagal: {error}"))?;

    let mut pending = vec![root.clone()];
    let mut paths = Vec::<PathBuf>::new();
    let mut truncated = false;

    while let Some(directory) = pending.pop() {
        let entries = fs::read_dir(&directory)
            .map_err(|error| format!("Gagal membaca folder {}: {error}", directory.display()))?;
        for entry in entries {
            let entry = entry.map_err(|error| format!("Gagal membaca entri folder: {error}"))?;
            let file_type = entry.file_type().map_err(|error| format!("Gagal memeriksa file: {error}"))?;
            if file_type.is_symlink() {
                continue;
            }
            if file_type.is_dir() {
                pending.push(entry.path());
            } else if file_type.is_file() && supported_audio_file(&entry.path()) {
                paths.push(entry.path());
                if paths.len() >= MAX_TRACKS_PER_SCAN {
                    truncated = true;
                    break;
                }
            }
        }
        if truncated {
            break;
        }
    }

    for file_path in &paths {
        let metadata = fs::metadata(file_path)
            .map_err(|error| format!("Metadata file tidak dapat dibaca: {error}"))?;
        let canonical_path = file_path.canonicalize()
            .map_err(|error| format!("Path file tidak dapat diresolusikan: {error}"))?
            .to_string_lossy()
            .into_owned();
        let title = file_path
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("Unknown title")
            .to_string();
        let format = file_path
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or("unknown")
            .to_ascii_uppercase();
        let size_bytes = metadata.len().min(i64::MAX as u64) as i64;
        let modified_at = file_modified_timestamp(file_path);
        transaction.execute(
            "INSERT INTO tracks (path, title, format, size_bytes, modified_at, scanned_at)
             VALUES (?1, ?2, ?3, ?4, ?5, CURRENT_TIMESTAMP)
             ON CONFLICT(path) DO UPDATE SET
               title = excluded.title,
               format = excluded.format,
               size_bytes = excluded.size_bytes,
               modified_at = excluded.modified_at,
               scanned_at = CURRENT_TIMESTAMP",
            params![canonical_path, title, format, size_bytes, modified_at],
        ).map_err(|error| format!("Menyimpan indeks track gagal: {error}"))?;
    }

    transaction.commit().map_err(|error| format!("Menyimpan hasil scan gagal: {error}"))?;
    let tracks = list_tracks_from_db(&connection)?;
    let scanned_folder = root.to_string_lossy().into_owned();
    Ok(ScanResult { tracks, truncated, scanned_folder })
}

#[tauri::command]
fn native_play_track(
    path: String,
    start_from_ms: Option<u64>,
    state: State<'_, AppState>,
) -> Result<PlaybackSnapshot, String> {
    let file_path = PathBuf::from(&path);
    if !file_path.is_file() || !supported_audio_file(&file_path) {
        return Err("File tidak ditemukan atau format audio belum didukung.".to_string());
    }

    let file = File::open(&file_path).map_err(|error| format!("File audio tidak dapat dibuka: {error}"))?;
    let decoder = Decoder::try_from(file)
        .map_err(|error| format!("Decoder tidak dapat membaca file ini: {error}"))?;
    let duration_ms = decoder.total_duration()
        .map(|duration| duration.as_millis().min(u64::MAX as u128) as u64)
        .unwrap_or(0);

    let mut playback = state.playback.lock().map_err(|_| "State audio terkunci.".to_string())?;
    if playback.output_stream.is_none() {
        playback.output_stream = Some(
            OutputStreamBuilder::open_default_stream()
                .map_err(|error| format!("Perangkat output audio tidak dapat dibuka: {error}"))?,
        );
    }
    if let Some(previous) = playback.sink.take() {
        previous.stop();
    }

    let stream = playback.output_stream.as_ref().ok_or("Audio output belum siap.")?;
    let sink = Sink::connect_new(stream.mixer());
    sink.append(decoder);
    sink.set_volume(playback.volume.clamp(0.0, 1.0));
    if let Some(position) = start_from_ms.filter(|position| *position > 0) {
        sink.pause();
        sink.try_seek(Duration::from_millis(position.min(duration_ms.max(position))))
            .map_err(|error| format!("Seek gagal: {error}"))?;
    }
    sink.play();
    playback.sink = Some(sink);
    playback.track_path = Some(file_path.canonicalize().unwrap_or(file_path).to_string_lossy().into_owned());
    playback.duration_ms = duration_ms;
    Ok(snapshot_from_playback(&playback))
}

#[tauri::command]
fn native_pause(state: State<'_, AppState>) -> Result<(), String> {
    let playback = state.playback.lock().map_err(|_| "State audio terkunci.".to_string())?;
    if let Some(sink) = &playback.sink {
        sink.pause();
    }
    Ok(())
}

#[tauri::command]
fn native_resume(state: State<'_, AppState>) -> Result<(), String> {
    let playback = state.playback.lock().map_err(|_| "State audio terkunci.".to_string())?;
    if let Some(sink) = &playback.sink {
        sink.play();
    }
    Ok(())
}

#[tauri::command]
fn native_seek(position_ms: u64, state: State<'_, AppState>) -> Result<(), String> {
    let playback = state.playback.lock().map_err(|_| "State audio terkunci.".to_string())?;
    let sink = playback.sink.as_ref().ok_or("Belum ada track yang diputar.")?;
    sink.try_seek(Duration::from_millis(position_ms))
        .map_err(|error| format!("Seek gagal: {error}"))
}

#[tauri::command]
fn native_set_volume(volume: f32, state: State<'_, AppState>) -> Result<(), String> {
    if !volume.is_finite() {
        return Err("Volume tidak valid.".to_string());
    }
    let mut playback = state.playback.lock().map_err(|_| "State audio terkunci.".to_string())?;
    playback.volume = volume.clamp(0.0, 1.0);
    if let Some(sink) = &playback.sink {
        sink.set_volume(playback.volume);
    }
    Ok(())
}

#[tauri::command]
fn native_stop(state: State<'_, AppState>) -> Result<(), String> {
    let mut playback = state.playback.lock().map_err(|_| "State audio terkunci.".to_string())?;
    if let Some(sink) = playback.sink.take() {
        sink.stop();
    }
    playback.track_path = None;
    playback.duration_ms = 0;
    Ok(())
}

#[tauri::command]
fn native_playback_state(state: State<'_, AppState>) -> Result<PlaybackSnapshot, String> {
    let playback = state.playback.lock().map_err(|_| "State audio terkunci.".to_string())?;
    Ok(snapshot_from_playback(&playback))
}

fn snapshot_from_playback(playback: &NativePlayback) -> PlaybackSnapshot {
    let sink = playback.sink.as_ref();
    let is_playing = sink.map(|value| !value.is_paused() && !value.empty()).unwrap_or(false);
    let mut current_time_ms = sink
        .map(|value| value.get_pos().as_millis().min(u64::MAX as u128) as u64)
        .unwrap_or(0);
    if sink.map(Sink::empty).unwrap_or(false) && playback.duration_ms > 0 {
        current_time_ms = playback.duration_ms;
    }
    PlaybackSnapshot {
        path: playback.track_path.clone(),
        is_playing,
        current_time_ms,
        duration_ms: playback.duration_ms,
        volume: playback.volume,
    }
}

#[cfg(test)]
mod tests {
    use super::{supported_audio_file, AUDIO_EXTENSIONS};
    use std::path::Path;

    #[test]
    fn accepts_supported_extensions_case_insensitively() {
        assert!(supported_audio_file(Path::new("album/TRACK.FLAC")));
        assert!(supported_audio_file(Path::new("song.wav")));
        assert!(supported_audio_file(Path::new("song.Mp3")));
    }

    #[test]
    fn rejects_non_audio_and_unknown_extensions() {
        assert!(!supported_audio_file(Path::new("cover.jpg")));
        assert!(!supported_audio_file(Path::new("malware.exe")));
        assert!(!supported_audio_file(Path::new("no_extension")));
    }

    #[test]
    fn supported_extensions_are_nonempty() {
        assert!(AUDIO_EXTENSIONS.len() >= 3);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_directory = app.path().app_data_dir()?;
            fs::create_dir_all(&data_directory)?;
            let database_path = data_directory.join("mplayer-library.sqlite3");
            initialize_database(&database_path).map_err(std::io::Error::other)?;
            app.manage(AppState {
                database_path,
                playback: Mutex::new(NativePlayback {
                    volume: 0.85,
                    ..NativePlayback::default()
                }),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            native_runtime_info,
            native_list_tracks,
            native_scan_music_directory,
            native_play_track,
            native_pause,
            native_resume,
            native_seek,
            native_set_volume,
            native_stop,
            native_playback_state
        ])
        .run(tauri::generate_context!())
        .expect("MPlayer native runtime gagal dijalankan");
}
