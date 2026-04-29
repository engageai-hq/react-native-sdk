/**
 * AudioService — wraps expo-av for mic recording and audio playback.
 *
 * Peer deps: expo-av >=14, expo-file-system >=17
 * Pass both modules when constructing so Metro bundles them correctly.
 *
 * IMPORTANT: import FileSystem from 'expo-file-system/legacy' in your app:
 *   import * as FileSystem from 'expo-file-system/legacy';
 * The legacy module exposes `cacheDirectory`, `readAsStringAsync`, and
 * `writeAsStringAsync` which this service needs. The modern `expo-file-system`
 * (without /legacy) split these into a different API.
 */

import type { Audio } from 'expo-av';

export type ExpoAudio = typeof Audio;

/**
 * Structural type for the subset of expo-file-system we use. Defined
 * structurally rather than `typeof FileSystem` so the SDK works whether the
 * caller imports from 'expo-file-system' or 'expo-file-system/legacy'.
 */
export interface ExpoFileSystem {
  cacheDirectory: string | null;
  readAsStringAsync(
    uri: string,
    options?: { encoding?: string }
  ): Promise<string>;
  writeAsStringAsync(
    uri: string,
    contents: string,
    options?: { encoding?: string }
  ): Promise<void>;
}

export interface AudioServiceConfig {
  /** Pass `Audio` from `import { Audio } from 'expo-av'` */
  Audio: ExpoAudio;
  /** Pass `* as FileSystem` from `import * as FileSystem from 'expo-file-system/legacy'` */
  FileSystem: ExpoFileSystem;
}

export class AudioService {
  private readonly Audio: ExpoAudio;
  private readonly FileSystem: ExpoFileSystem;
  private recording: InstanceType<ExpoAudio['Recording']> | null = null;
  private sound: InstanceType<ExpoAudio['Sound']> | null = null;

  constructor(config: AudioServiceConfig) {
    this.Audio = config.Audio;
    this.FileSystem = config.FileSystem;
  }

  /** Request mic permissions. Call once before recording. */
  async requestPermissions(): Promise<boolean> {
    const { granted } = await this.Audio.requestPermissionsAsync();
    return granted;
  }

  /** Start recording from the microphone. */
  async startRecording(): Promise<void> {
    await this.Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });

    const { recording } = await this.Audio.Recording.createAsync(
      this.Audio.RecordingOptionsPresets.HIGH_QUALITY,
    );

    this.recording = recording;
  }

  /**
   * Stop recording and return the raw audio bytes (base64-encoded)
   * ready to send to the backend.
   */
  async stopRecording(): Promise<{ base64: string; uri: string }> {
    if (!this.recording) {
      throw new Error('No active recording');
    }

    await this.recording.stopAndUnloadAsync();
    const uri = this.recording.getURI();
    this.recording = null;

    if (!uri) throw new Error('Recording URI is null');

    const base64 = await this.FileSystem.readAsStringAsync(uri, {
      encoding: 'base64',
    });

    return { base64, uri };
  }

  /** True while a recording is in progress. */
  get isRecording(): boolean {
    return this.recording !== null;
  }

  /**
   * Play MP3 audio from a base64-encoded string.
   * Resolves when playback finishes (or rejects on error).
   */
  async playBase64Audio(base64: string): Promise<void> {
    await this.stopPlayback();

    const cacheDir = this.FileSystem.cacheDirectory;
    if (!cacheDir) {
      throw new Error(
        'FileSystem.cacheDirectory is null. Make sure you imported FileSystem ' +
        'from "expo-file-system/legacy" (not the modern API).'
      );
    }

    const uri = `${cacheDir}engage_tts_${Date.now()}.mp3`;
    await this.FileSystem.writeAsStringAsync(uri, base64, {
      encoding: 'base64',
    });

    await this.Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
    });

    const { sound } = await this.Audio.Sound.createAsync({ uri });
    this.sound = sound;

    return new Promise((resolve, reject) => {
      sound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded) return;
        if (status.didJustFinish) {
          sound.unloadAsync().catch(() => {});
          this.sound = null;
          resolve();
        }
      });

      sound.playAsync().catch(reject);
    });
  }

  /** Stop any in-progress playback. */
  async stopPlayback(): Promise<void> {
    if (this.sound) {
      try {
        await this.sound.stopAsync();
        await this.sound.unloadAsync();
      } catch {
        // ignore
      }
      this.sound = null;
    }
  }

  /** True while audio is playing. */
  get isPlaying(): boolean {
    return this.sound !== null;
  }

  /** Release all resources. */
  async dispose(): Promise<void> {
    await this.stopPlayback();
    if (this.recording) {
      try {
        await this.recording.stopAndUnloadAsync();
      } catch {
        // ignore
      }
      this.recording = null;
    }
  }
}
