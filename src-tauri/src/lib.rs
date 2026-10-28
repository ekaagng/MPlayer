use lofty::{file::{AudioFile, TaggedFileExt}, tag::Accessor};
use rodio::{Decoder, OutputStream, OutputStreamBuilder, Sink, Source};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use std::{
    fs::{self, File},
    path::{Path, PathBuf},
    sync::Mutex,
    time::{Duration, UNIX_EPOCH},
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
    track_id: Option<i64>,
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
    artist: String,
    album: String,
    format: String,
    size_bytes: u64,
    modified_at: Option<i64>,
    duration_ms: Option<i64>,
    sample_rate_hz: Option<i64>,
    bit_depth: Option<i64>,
    bitrate_bps: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativePlaylist {
    id: i64,
    name: String,
    track_ids: Vec<i64>,
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
struct NativeHistoryEntry {
    track: NativeTrack,
    played_at: String,
    last_position_ms: u64,
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
            CREATE TABLE IF NOT EXISTS library_roots (
                root_path TEXT PRIMARY KEY,
                last_scanned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS library_root_tracks (
                root_path TEXT NOT NULL REFERENCES library_roots(root_path) ON DELETE CASCADE,
                track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
                PRIMARY KEY (root_path, track_id)
            );
            CREATE INDEX IF NOT EXISTS idx_library_root_tracks_track_id ON library_root_tracks(track_id);
            CREATE TABLE IF NOT EXISTS playlists (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_playlists_name_nocase
                ON playlists(name COLLATE NOCASE);
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

fn open_database(path: &Path) -> Result<Connection, String> {
    let connection = Connection::open(path)
        .map_err(|error| format!("Database lokal tidak dapat dibuka: {error}"))?;
    connection.pragma_update(None, "foreign_keys", "ON")
        .map_err(|error| format!("Foreign-key constraints gagal diaktifkan: {error}"))?;
    connection.busy_timeout(Duration::from_secs(5))
        .map_err(|error| format!("Timeout database gagal disetel: {error}"))?;
    Ok(connection)
}

fn playlist_from_db(connection: &Connection, playlist_id: i64) -> Result<NativePlaylist, String> {
    let name = connection.query_row(
        "SELECT name FROM playlists WHERE id = ?1",
        [playlist_id],
        |row| row.get::<_, String>(0),
    ).map_err(|error| format!("Playlist tidak ditemukan: {error}"))?;

    let mut statement = connection.prepare(
        "SELECT track_id FROM playlist_tracks WHERE playlist_id = ?1 ORDER BY position, track_id"
    ).map_err(|error| format!("Query track playlist gagal: {error}"))?;
    let rows = statement.query_map([playlist_id], |row| row.get::<_, i64>(0))
        .map_err(|error| format!("Membaca track playlist gagal: {error}"))?;
    let track_ids = rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Membaca track playlist gagal: {error}"))?;

    Ok(NativePlaylist { id: playlist_id, name, track_ids })
}

fn list_playlists_from_db(connection: &Connection) -> Result<Vec<NativePlaylist>, String> {
    let playlist_ids = {
        let mut statement = connection.prepare(
            "SELECT id FROM playlists ORDER BY name COLLATE NOCASE, id"
        ).map_err(|error| format!("Query playlist gagal: {error}"))?;
        let rows = statement.query_map([], |row| row.get::<_, i64>(0))
            .map_err(|error| format!("Membaca playlist gagal: {error}"))?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("Membaca playlist gagal: {error}"))?
    };

    playlist_ids.into_iter()
        .map(|playlist_id| playlist_from_db(connection, playlist_id))
        .collect()
}

fn create_playlist_in_db(connection: &Connection, name: &str) -> Result<NativePlaylist, String> {
    let normalized = name.trim();
    if normalized.is_empty() || normalized.chars().count() > 80 {
        return Err("Nama playlist wajib diisi dan maksimal 80 karakter.".to_string());
    }
    connection.execute("INSERT INTO playlists (name) VALUES (?1)", params![normalized])
        .map_err(|error| format!("Playlist tidak dapat dibuat. Pastikan namanya belum digunakan. Detail: {error}"))?;
    playlist_from_db(connection, connection.last_insert_rowid())
}

fn rename_playlist_in_db(connection: &Connection, playlist_id: i64, name: &str) -> Result<NativePlaylist, String> {
    let normalized = name.trim();
    if normalized.is_empty() || normalized.chars().count() > 80 {
        return Err("Nama playlist wajib diisi dan maksimal 80 karakter.".to_string());
    }
    let changed = connection.execute(
        "UPDATE playlists SET name = ?1 WHERE id = ?2",
        params![normalized, playlist_id],
    ).map_err(|error| format!("Nama playlist tidak dapat diperbarui. Pastikan namanya belum digunakan. Detail: {error}"))?;
    if changed == 0 {
        return Err("Playlist yang akan diubah tidak ditemukan.".to_string());
    }
    playlist_from_db(connection, playlist_id)
}

fn delete_playlist_in_db(connection: &Connection, playlist_id: i64) -> Result<(), String> {
    let changed = connection.execute("DELETE FROM playlists WHERE id = ?1", [playlist_id])
        .map_err(|error| format!("Playlist tidak dapat dihapus: {error}"))?;
    if changed == 0 {
        return Err("Playlist yang akan dihapus tidak ditemukan.".to_string());
    }
    Ok(())
}

fn add_track_to_playlist_in_db(
    connection: &Connection,
    playlist_id: i64,
    track_id: i64,
) -> Result<NativePlaylist, String> {
    let position: i64 = connection.query_row(
        "SELECT COALESCE(MAX(position), -1) + 1 FROM playlist_tracks WHERE playlist_id = ?1",
        [playlist_id],
        |row| row.get(0),
    ).map_err(|error| format!("Posisi playlist tidak dapat dibaca: {error}"))?;
    let changed = connection.execute(
        "INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position) VALUES (?1, ?2, ?3)",
        params![playlist_id, track_id, position],
    ).map_err(|error| format!("Track tidak dapat ditambahkan ke playlist: {error}"))?;
    if changed == 0 {
        return Err("Track sudah ada di playlist, atau playlist/track tidak ditemukan.".to_string());
    }
    playlist_from_db(connection, playlist_id)
}

fn get_lyrics_from_db(connection: &Connection, track_id: i64) -> Result<Option<String>, String> {
    connection.query_row(
        "SELECT lrc_text FROM lyrics WHERE track_id = ?1",
        [track_id],
        |row| row.get::<_, String>(0),
    ).optional().map_err(|error| format!("Lirik tidak dapat dibaca dari SQLite: {error}"))
}

fn save_lyrics_to_db(connection: &Connection, track_id: i64, lrc_text: &str) -> Result<(), String> {
    if lrc_text.len() > 1_048_576 {
        return Err("File lirik terlalu besar; batas penyimpanan adalah 1 MiB per lagu.".to_string());
    }
    if lrc_text.trim().is_empty() {
        connection.execute("DELETE FROM lyrics WHERE track_id = ?1", [track_id])
            .map_err(|error| format!("Lirik tidak dapat dihapus: {error}"))?;
        return Ok(());
    }
    connection.execute(
        "INSERT INTO lyrics (track_id, lrc_text, updated_at)
         VALUES (?1, ?2, CURRENT_TIMESTAMP)
         ON CONFLICT(track_id) DO UPDATE SET
           lrc_text = excluded.lrc_text,
           updated_at = CURRENT_TIMESTAMP",
        params![track_id, lrc_text],
    ).map_err(|error| format!("Lirik tidak dapat disimpan. Pastikan track sudah diindeks ke library. Detail: {error}"))?;
    Ok(())
}

#[derive(Debug, Clone)]
struct ScannedFile {
    path: String,
    title: String,
    artist: String,
    album: String,
    format: String,
    size_bytes: i64,
    modified_at: Option<i64>,
    duration_ms: Option<i64>,
    sample_rate_hz: Option<i64>,
    bit_depth: Option<i64>,
    bitrate_bps: Option<i64>,
}

#[derive(Debug, Default)]
struct AudioMetadata {
    title: Option<String>,
    artist: Option<String>,
    album: Option<String>,
    duration_ms: Option<i64>,
    sample_rate_hz: Option<i64>,
    bit_depth: Option<i64>,
    bitrate_bps: Option<i64>,
}

fn read_audio_metadata(path: &Path) -> AudioMetadata {
    let tagged_file = match lofty::read_from_path(path) {
        Ok(file) => file,
        Err(_) => return AudioMetadata::default(),
    };

    let tag = tagged_file.primary_tag().or_else(|| tagged_file.first_tag());
    let nonempty = |value: Option<std::borrow::Cow<'_, str>>| {
        value.map(|text| text.into_owned()).filter(|text| !text.trim().is_empty())
    };
    let properties = tagged_file.properties();
    let duration_ms = properties.duration().as_millis().min(i64::MAX as u128) as i64;

    AudioMetadata {
        title: tag.and_then(|value| nonempty(value.title())),
        artist: tag.and_then(|value| nonempty(value.artist())),
        album: tag.and_then(|value| nonempty(value.album())),
        duration_ms: (duration_ms > 0).then_some(duration_ms),
        sample_rate_hz: properties.sample_rate().map(i64::from),
        bit_depth: properties.bit_depth().map(i64::from),
        bitrate_bps: properties.audio_bitrate()
            .or_else(|| properties.overall_bitrate())
            .map(|kbps| i64::from(kbps).saturating_mul(1000)),
    }
}

fn apply_scan_results(
    connection: &Connection,
    root_path: &str,
    files: &[ScannedFile],
    truncated: bool,
) -> Result<(), String> {
    connection.execute_batch(
        "CREATE TEMP TABLE IF NOT EXISTS scan_seen_track_ids (track_id INTEGER PRIMARY KEY);
         CREATE TEMP TABLE IF NOT EXISTS scan_removed_track_ids (track_id INTEGER PRIMARY KEY);
         DELETE FROM scan_seen_track_ids;
         DELETE FROM scan_removed_track_ids;"
    ).map_err(|error| format!("Tabel sementara pemindaian gagal disiapkan: {error}"))?;

    let transaction = connection.unchecked_transaction()
        .map_err(|error| format!("Transaksi database gagal: {error}"))?;
    transaction.execute(
        "INSERT INTO library_roots (root_path) VALUES (?1)
         ON CONFLICT(root_path) DO NOTHING",
        [root_path],
    ).map_err(|error| format!("Folder library tidak dapat dicatat: {error}"))?;

    for file in files {
        transaction.execute(
            "INSERT INTO tracks
               (path, title, artist, album, format, size_bytes, modified_at,
                duration_ms, sample_rate_hz, bit_depth, bitrate_bps, scanned_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, CURRENT_TIMESTAMP)
             ON CONFLICT(path) DO UPDATE SET
               title = excluded.title,
               artist = excluded.artist,
               album = excluded.album,
               format = excluded.format,
               size_bytes = excluded.size_bytes,
               modified_at = excluded.modified_at,
               duration_ms = excluded.duration_ms,
               sample_rate_hz = excluded.sample_rate_hz,
               bit_depth = excluded.bit_depth,
               bitrate_bps = excluded.bitrate_bps,
               scanned_at = CURRENT_TIMESTAMP",
            params![
                file.path, file.title, file.artist, file.album, file.format,
                file.size_bytes, file.modified_at, file.duration_ms,
                file.sample_rate_hz, file.bit_depth, file.bitrate_bps
            ],
        ).map_err(|error| format!("Menyimpan indeks track gagal: {error}"))?;

        let track_id: i64 = transaction.query_row(
            "SELECT id FROM tracks WHERE path = ?1",
            [&file.path],
            |row| row.get(0),
        ).map_err(|error| format!("ID track yang dipindai tidak dapat dibaca: {error}"))?;

        transaction.execute(
            "INSERT OR IGNORE INTO library_root_tracks (root_path, track_id) VALUES (?1, ?2)",
            params![root_path, track_id],
        ).map_err(|error| format!("Relasi folder dan track gagal disimpan: {error}"))?;
        transaction.execute(
            "INSERT OR IGNORE INTO scan_seen_track_ids (track_id) VALUES (?1)",
            [track_id],
        ).map_err(|error| format!("Daftar hasil pemindaian gagal disimpan: {error}"))?;
    }

    if !truncated {
        transaction.execute(
            "INSERT OR IGNORE INTO scan_removed_track_ids (track_id)
             SELECT track_id FROM library_root_tracks
             WHERE root_path = ?1
               AND track_id NOT IN (SELECT track_id FROM scan_seen_track_ids)",
            [root_path],
        ).map_err(|error| format!("Rekonsiliasi library gagal disiapkan: {error}"))?;

        transaction.execute(
            "DELETE FROM library_root_tracks
             WHERE root_path = ?1
               AND track_id NOT IN (SELECT track_id FROM scan_seen_track_ids)",
            [root_path],
        ).map_err(|error| format!("File yang tidak lagi tersedia gagal direkonsiliasi: {error}"))?;

        transaction.execute(
            "DELETE FROM tracks
             WHERE id IN (SELECT track_id FROM scan_removed_track_ids)
               AND NOT EXISTS (
                 SELECT 1 FROM library_root_tracks
                 WHERE library_root_tracks.track_id = tracks.id
               )",
            [],
        ).map_err(|error| format!("Indeks file yang dihapus gagal dibersihkan: {error}"))?;
    }

    transaction.execute(
        "UPDATE library_roots SET last_scanned_at = CURRENT_TIMESTAMP WHERE root_path = ?1",
        [root_path],
    ).map_err(|error| format!("Waktu pemindaian tidak dapat disimpan: {error}"))?;

    transaction.commit().map_err(|error| format!("Menyimpan hasil scan gagal: {error}"))?;
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
        artist: row.get(3)?,
        album: row.get(4)?,
        format: row.get(5)?,
        size_bytes: row.get::<_, i64>(6)?.max(0) as u64,
        modified_at: row.get(7)?,
        duration_ms: row.get(8)?,
        sample_rate_hz: row.get(9)?,
        bit_depth: row.get(10)?,
        bitrate_bps: row.get(11)?,
    })
}

fn list_tracks_from_db(connection: &Connection) -> Result<Vec<NativeTrack>, String> {
    let mut statement = connection
        .prepare("SELECT id, path, title, artist, album, format, size_bytes, modified_at, duration_ms, sample_rate_hz, bit_depth, bitrate_bps FROM tracks ORDER BY title COLLATE NOCASE")
        .map_err(|error| format!("Query library gagal: {error}"))?;
    let rows = statement
        .query_map([], read_track)
        .map_err(|error| format!("Membaca library gagal: {error}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Membaca track gagal: {error}"))
}

fn persist_current_playback_position(playback: &NativePlayback, database_path: &Path) -> Result<(), String> {
    let Some(track_id) = playback.track_id else {
        return Ok(());
    };
    let position_ms = playback.sink.as_ref()
        .map(|sink| sink.get_pos().as_millis().min(i64::MAX as u128) as i64)
        .unwrap_or(0);
    let connection = open_database(database_path)?;
    connection.execute(
        "UPDATE playback_history SET last_position_ms = ?1
         WHERE id = (SELECT id FROM playback_history WHERE track_id = ?2 ORDER BY id DESC LIMIT 1)",
        params![position_ms, track_id],
    ).map_err(|error| format!("Posisi terakhir playback gagal disimpan: {error}"))?;
    Ok(())
}

fn list_recent_history_from_db(connection: &Connection, limit: u32) -> Result<Vec<NativeHistoryEntry>, String> {
    let mut statement = connection.prepare(
        "SELECT t.id, t.path, t.title, t.artist, t.album, t.format, t.size_bytes,
                t.modified_at, t.duration_ms, t.sample_rate_hz, t.bit_depth, t.bitrate_bps,
                h.played_at, h.last_position_ms
         FROM playback_history h
         INNER JOIN tracks t ON t.id = h.track_id
         WHERE h.id = (
             SELECT MAX(latest.id) FROM playback_history latest WHERE latest.track_id = t.id
         )
         ORDER BY h.id DESC
         LIMIT ?1"
    ).map_err(|error| format!("Query riwayat playback gagal: {error}"))?;
    let rows = statement.query_map([limit.clamp(1, 100)], |row| {
        Ok(NativeHistoryEntry {
            track: NativeTrack {
                id: row.get(0)?,
                path: row.get(1)?,
                title: row.get(2)?,
                artist: row.get(3)?,
                album: row.get(4)?,
                format: row.get(5)?,
                size_bytes: row.get::<_, i64>(6)?.max(0) as u64,
                modified_at: row.get(7)?,
                duration_ms: row.get(8)?,
                sample_rate_hz: row.get(9)?,
                bit_depth: row.get(10)?,
                bitrate_bps: row.get(11)?,
            },
            played_at: row.get(12)?,
            last_position_ms: row.get::<_, i64>(13)?.max(0) as u64,
        })
    }).map_err(|error| format!("Membaca riwayat playback gagal: {error}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Membaca entri riwayat gagal: {error}"))
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
    let connection = open_database(&state.database_path)?;
    list_tracks_from_db(&connection)
}

#[tauri::command]
fn native_get_recent_history(limit: Option<u32>, state: State<'_, AppState>) -> Result<Vec<NativeHistoryEntry>, String> {
    let connection = open_database(&state.database_path)?;
    list_recent_history_from_db(&connection, limit.unwrap_or(20))
}

#[tauri::command]
fn native_list_playlists(state: State<'_, AppState>) -> Result<Vec<NativePlaylist>, String> {
    let connection = open_database(&state.database_path)?;
    list_playlists_from_db(&connection)
}

#[tauri::command]
fn native_create_playlist(name: String, state: State<'_, AppState>) -> Result<NativePlaylist, String> {
    let connection = open_database(&state.database_path)?;
    create_playlist_in_db(&connection, &name)
}

#[tauri::command]
fn native_rename_playlist(playlist_id: i64, name: String, state: State<'_, AppState>) -> Result<NativePlaylist, String> {
    let connection = open_database(&state.database_path)?;
    rename_playlist_in_db(&connection, playlist_id, &name)
}

#[tauri::command]
fn native_delete_playlist(playlist_id: i64, state: State<'_, AppState>) -> Result<(), String> {
    let connection = open_database(&state.database_path)?;
    delete_playlist_in_db(&connection, playlist_id)
}

#[tauri::command]
fn native_add_track_to_playlist(playlist_id: i64, track_id: i64, state: State<'_, AppState>) -> Result<NativePlaylist, String> {
    let connection = open_database(&state.database_path)?;
    add_track_to_playlist_in_db(&connection, playlist_id, track_id)
}

#[tauri::command]
fn native_get_lyrics(track_id: i64, state: State<'_, AppState>) -> Result<Option<String>, String> {
    let connection = open_database(&state.database_path)?;
    get_lyrics_from_db(&connection, track_id)
}

#[tauri::command]
fn native_save_lyrics(track_id: i64, lrc_text: String, state: State<'_, AppState>) -> Result<(), String> {
    let connection = open_database(&state.database_path)?;
    save_lyrics_to_db(&connection, track_id, &lrc_text)
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
    let connection = open_database(&state.database_path)?;

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

    let mut scanned_files = Vec::with_capacity(paths.len());
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
        let audio_metadata = read_audio_metadata(file_path);
        let title = audio_metadata.title.unwrap_or(title);
        scanned_files.push(ScannedFile {
            path: canonical_path,
            artist: audio_metadata.artist.unwrap_or_default(),
            album: audio_metadata.album.unwrap_or_default(),
            title,
            format,
            size_bytes: metadata.len().min(i64::MAX as u64) as i64,
            modified_at: file_modified_timestamp(file_path),
            duration_ms: audio_metadata.duration_ms,
            sample_rate_hz: audio_metadata.sample_rate_hz,
            bit_depth: audio_metadata.bit_depth,
            bitrate_bps: audio_metadata.bitrate_bps,
        });
    }

    let scanned_folder = root.to_string_lossy().into_owned();
    apply_scan_results(&connection, &scanned_folder, &scanned_files, truncated)?;
    let tracks = list_tracks_from_db(&connection)?;
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
    let canonical_path = file_path.canonicalize().unwrap_or_else(|_| file_path.clone());
    let canonical_path_string = canonical_path.to_string_lossy().into_owned();
    let database_path = state.database_path.clone();
    let indexed_track_id = open_database(&database_path).ok().and_then(|connection| {
        connection.query_row(
            "SELECT id FROM tracks WHERE path = ?1",
            [&canonical_path_string],
            |row| row.get::<_, i64>(0),
        ).optional().ok().flatten()
    });

    let mut playback = state.playback.lock().map_err(|_| "State audio terkunci.".to_string())?;
    let _ = persist_current_playback_position(&playback, &database_path);
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
        sink.try_seek(Duration::from_millis(if duration_ms > 0 { position.min(duration_ms) } else { position }))
            .map_err(|error| format!("Seek gagal: {error}"))?;
    }
    sink.play();
    playback.sink = Some(sink);
    playback.track_path = Some(canonical_path_string);
    playback.track_id = indexed_track_id;
    playback.duration_ms = duration_ms;
    if let Some(track_id) = playback.track_id {
        match open_database(&database_path).and_then(|connection| {
            connection.execute(
                "INSERT INTO playback_history (track_id, last_position_ms) VALUES (?1, 0)",
                [track_id],
            ).map(|_| ()).map_err(|error| format!("Riwayat playback gagal disimpan: {error}"))
        }) {
            Ok(()) => {}
            Err(error) => eprintln!("[MPlayer] {error}"),
        }
    }
    Ok(snapshot_from_playback(&playback))
}

#[tauri::command]
fn native_pause(state: State<'_, AppState>) -> Result<(), String> {
    let database_path = state.database_path.clone();
    let playback = state.playback.lock().map_err(|_| "State audio terkunci.".to_string())?;
    if let Some(sink) = &playback.sink {
        sink.pause();
    }
    persist_current_playback_position(&playback, &database_path)
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
    let database_path = state.database_path.clone();
    let playback = state.playback.lock().map_err(|_| "State audio terkunci.".to_string())?;
    let sink = playback.sink.as_ref().ok_or("Belum ada track yang diputar.")?;
    sink.try_seek(Duration::from_millis(position_ms))
        .map_err(|error| format!("Seek gagal: {error}"))?;
    persist_current_playback_position(&playback, &database_path)
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
    let database_path = state.database_path.clone();
    let mut playback = state.playback.lock().map_err(|_| "State audio terkunci.".to_string())?;
    persist_current_playback_position(&playback, &database_path)?;
    if let Some(sink) = playback.sink.take() {
        sink.stop();
    }
    playback.track_path = None;
    playback.track_id = None;
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
    use super::{
        add_track_to_playlist_in_db, apply_scan_results, create_playlist_in_db,
        delete_playlist_in_db, get_lyrics_from_db, initialize_database, list_playlists_from_db,
        list_tracks_from_db, open_database, rename_playlist_in_db, save_lyrics_to_db,
        supported_audio_file, ScannedFile, AUDIO_EXTENSIONS,
    };
    use rusqlite::Connection;
    use std::{fs, path::Path, time::{SystemTime, UNIX_EPOCH}};

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

    #[test]
    fn initializes_sqlite_schema_and_reads_indexed_tracks() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be after Unix epoch")
            .as_nanos();
        let test_dir = std::env::temp_dir().join(format!("mplayer-test-{}-{nonce}", std::process::id()));
        fs::create_dir_all(&test_dir).expect("test directory should be created");
        let database_path = test_dir.join("library.sqlite3");

        initialize_database(&database_path).expect("schema should be initialized");
        let connection = Connection::open(&database_path).expect("test database should open");
        let table_count: i64 = connection.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN
             ('tracks', 'library_roots', 'library_root_tracks', 'playlists', 'playlist_tracks', 'playback_history', 'lyrics', 'settings')",
            [],
            |row| row.get(0),
        ).expect("schema count query should succeed");
        assert_eq!(table_count, 8);

        connection.execute(
            "INSERT INTO tracks (path, title, artist, album, format, size_bytes, modified_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![
                "/music/test.flac", "test", "", "", "FLAC",
                4096_i64, Option::<i64>::None
            ],
        ).expect("track should be indexed");
        let tracks = list_tracks_from_db(&connection).expect("indexed tracks should be readable");
        assert_eq!(tracks.len(), 1);
        assert_eq!(tracks[0].title, "test");
        assert_eq!(tracks[0].format, "FLAC");
        assert_eq!(tracks[0].size_bytes, 4096);
        drop(connection);

        let connection = open_database(&database_path).expect("foreign keys should be active");
        let root = test_dir.to_string_lossy().into_owned();
        let make_file = |name: &str| ScannedFile {
            path: format!("{root}/{name}"),
            title: name.trim_end_matches(".flac").trim_end_matches(".wav").to_string(),
            artist: String::new(),
            album: String::new(),
            format: if name.ends_with(".wav") { "WAV".to_string() } else { "FLAC".to_string() },
            size_bytes: 2048,
            modified_at: None,
            duration_ms: None,
            sample_rate_hz: None,
            bit_depth: None,
            bitrate_bps: None,
        };
        apply_scan_results(&connection, &root, &[make_file("first.flac"), make_file("second.wav")], false)
            .expect("first scan should index all tracks");
        assert_eq!(list_tracks_from_db(&connection).expect("tracks should be readable").len(), 3);

        apply_scan_results(&connection, &root, &[make_file("second.wav")], false)
            .expect("complete rescan should reconcile deleted files");
        let remaining = list_tracks_from_db(&connection).expect("reconciled tracks should be readable");
        assert_eq!(remaining.len(), 2);
        assert!(!remaining.iter().any(|track| track.title == "first"));
        let third = make_file("third.flac");
        apply_scan_results(&connection, &root, &[make_file("second.wav"), third.clone()], true)
            .expect("truncated scan should index tracks without deleting unscanned data");
        assert_eq!(list_tracks_from_db(&connection).expect("tracks should be readable").len(), 3);
        let playlist = create_playlist_in_db(&connection, "  Night Drive  ")
            .expect("playlist should be created");
        assert_eq!(playlist.name, "Night Drive");
        assert!(create_playlist_in_db(&connection, "night drive").is_err());
        let populated = add_track_to_playlist_in_db(&connection, playlist.id, tracks[0].id)
            .expect("indexed track should be added");
        assert_eq!(populated.track_ids, vec![tracks[0].id]);
        assert!(add_track_to_playlist_in_db(&connection, playlist.id, tracks[0].id).is_err());
        let renamed = rename_playlist_in_db(&connection, playlist.id, "Night Drive 2")
            .expect("playlist should be renamed");
        assert_eq!(renamed.name, "Night Drive 2");

        let lrc = "[ti:Test]\n[ar:Test Artist]\n[00:01.00]A lyric line";
        save_lyrics_to_db(&connection, tracks[0].id, lrc).expect("lyrics should be saved");
        assert_eq!(get_lyrics_from_db(&connection, tracks[0].id).unwrap().as_deref(), Some(lrc));
        save_lyrics_to_db(&connection, tracks[0].id, "[ti:Updated]").expect("lyrics should update");
        assert_eq!(get_lyrics_from_db(&connection, tracks[0].id).unwrap().as_deref(), Some("[ti:Updated]"));

        delete_playlist_in_db(&connection, playlist.id).expect("playlist should be deleted");
        assert!(list_playlists_from_db(&connection).expect("playlists should be listed").is_empty());
        drop(connection);
        fs::remove_dir_all(&test_dir).expect("test directory should be removed");
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
            native_get_recent_history,
            native_list_playlists,
            native_create_playlist,
            native_rename_playlist,
            native_delete_playlist,
            native_add_track_to_playlist,
            native_get_lyrics,
            native_save_lyrics,
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
