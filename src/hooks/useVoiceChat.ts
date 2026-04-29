import { useState, useCallback, useRef } from 'react';
import { EngageAI } from '../core/EngageAI';
import { ApiClient } from '../services/ApiClient';
import { AudioService, ExpoAudio } from '../services/AudioService';
import { AgentAction } from '../models';

export type VoiceStatus = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';

export interface UseVoiceChatResult {
  voiceStatus: VoiceStatus;
  transcript: string;
  lastAction: AgentAction | null;
  error: string | null;
  isRecording: boolean;
  startListening: () => Promise<void>;
  stopListening: () => Promise<void>;
  stopSpeaking: () => Promise<void>;
}

/**
 * Hook for voice-based interaction with EngageAI.
 *
 * Requires expo-av and expo-file-system to be installed in the host app.
 *
 * @example
 * ```tsx
 * import { Audio } from 'expo-av';
 * const { voiceStatus, startListening, stopListening } = useVoiceChat(engageAI, Audio);
 * ```
 */
export function useVoiceChat(
  engageAI: EngageAI,
  ExpoAudioModule: ExpoAudio,
): UseVoiceChatResult {
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>('idle');
  const [transcript, setTranscript] = useState('');
  const [lastAction, setLastAction] = useState<AgentAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<AudioService | null>(null);
  const clientRef = useRef<ApiClient>(new ApiClient(engageAI.config));

  const getAudio = (): AudioService => {
    if (!audioRef.current) {
      audioRef.current = new AudioService({ Audio: ExpoAudioModule });
    }
    return audioRef.current;
  };

  const startListening = useCallback(async () => {
    setError(null);
    const audio = getAudio();

    const granted = await audio.requestPermissions();
    if (!granted) {
      setError('Microphone permission denied');
      setVoiceStatus('error');
      return;
    }

    try {
      await audio.startRecording();
      setVoiceStatus('listening');
    } catch (err) {
      setError(String(err));
      setVoiceStatus('error');
    }
  }, []);

  const stopListening = useCallback(async () => {
    const audio = getAudio();
    if (!audio.isRecording) return;

    setVoiceStatus('processing');

    try {
      const { base64 } = await audio.stopRecording();

      // Send to backend for STT + agent + TTS in one round-trip
      const result = await clientRef.current.processVoiceChat({
        sessionId: engageAI.currentSessionId,
        audioBase64: base64,
        voice: 'nova',
      });

      setTranscript(result.transcription);

      if (result.audioBase64) {
        setVoiceStatus('speaking');
        await audio.playBase64Audio(result.audioBase64);
      }

      setVoiceStatus('idle');
    } catch (err) {
      setError(String(err));
      setVoiceStatus('error');
    }
  }, [engageAI]);

  const stopSpeaking = useCallback(async () => {
    const audio = audioRef.current;
    if (audio) await audio.stopPlayback();
    setVoiceStatus('idle');
  }, []);

  return {
    voiceStatus,
    transcript,
    lastAction,
    error,
    isRecording: voiceStatus === 'listening',
    startListening,
    stopListening,
    stopSpeaking,
  };
}
