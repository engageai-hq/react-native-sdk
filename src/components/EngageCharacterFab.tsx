import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  Vibration,
  View,
  ViewStyle,
} from 'react-native';
import { EngageAI } from '../core/EngageAI';
import { AudioService, ExpoAudio, ExpoFileSystem } from '../services/AudioService';
import { ApiClient } from '../services/ApiClient';
import type RiveModule from 'rive-react-native';

export type CharacterState = 'idle' | 'listening' | 'thinking' | 'talking' | 'celebrating' | 'error';

export interface EngageCharacterFabProps {
  /** Called when tapped and no engageAI is provided (custom handler). */
  onPress?: () => void;
  /** Provide to enable the built-in dreamy overlay + inline voice. */
  engageAI?: EngageAI;
  Audio?: ExpoAudio;
  FileSystem?: ExpoFileSystem;
  welcomeMessage?: string;
  /** Called when user taps "Open full chat →" from the overlay. */
  onOpenChat?: () => void;
  characterState?: CharacterState;
  characterUrl?: string | null;
  apiKey?: string;
  primaryColor?: string;
  size?: number;
  style?: ViewStyle;
  Rive?: typeof RiveModule;
}

export function EngageCharacterFab({
  onPress,
  engageAI,
  Audio,
  FileSystem,
  welcomeMessage = 'Hi! How can I help you?',
  onOpenChat,
  characterState = 'idle',
  characterUrl,
  apiKey,
  primaryColor = '#1D4ED7',
  size = 72,
  style,
  Rive,
}: EngageCharacterFabProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [overlayVisible, setOverlayVisible] = useState(false);

  useEffect(() => {
    if (characterState === 'listening') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.15, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ]),
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [characterState]);

  const handlePress = () => {
    if (engageAI && Audio && FileSystem) {
      setOverlayVisible(true);
    } else {
      onPress?.();
    }
  };

  const handleOpenChat = () => {
    setOverlayVisible(false);
    onOpenChat?.();
  };

  return (
    <>
      <Animated.View
        style={[
          styles.outerRing,
          { width: size + 12, height: size + 12, borderRadius: (size + 12) / 2, borderColor: primaryColor, transform: [{ scale: pulseAnim }] },
          style,
        ]}
      >
        <Pressable
          onPress={handlePress}
          style={[styles.fab, { width: size, height: size, borderRadius: size / 2, backgroundColor: primaryColor }]}
        >
          <View style={styles.riveContainer}>
            {Rive && characterUrl ? (
              <Rive url={characterUrl} stateMachineName="State Machine 1" style={styles.rive} />
            ) : (
              <View style={[styles.placeholder, { backgroundColor: `${primaryColor}33` }]} />
            )}
          </View>
        </Pressable>
      </Animated.View>

      {engageAI && Audio && FileSystem && (
        <DreamyOverlay
          visible={overlayVisible}
          engageAI={engageAI}
          Audio={Audio}
          FileSystem={FileSystem}
          primaryColor={primaryColor}
          welcomeMessage={welcomeMessage}
          onOpenChat={handleOpenChat}
          onDismiss={() => setOverlayVisible(false)}
        />
      )}
    </>
  );
}

// ─── Dreamy overlay ───────────────────────────────────────────────────────────

type OverlayVoiceStatus = 'idle' | 'listening' | 'processing' | 'speaking';

interface DreamyOverlayProps {
  visible: boolean;
  engageAI: EngageAI;
  Audio: ExpoAudio;
  FileSystem: ExpoFileSystem;
  primaryColor: string;
  welcomeMessage: string;
  onOpenChat: () => void;
  onDismiss: () => void;
}

function DreamyOverlay({ visible, engageAI, Audio, FileSystem, primaryColor, welcomeMessage, onOpenChat, onDismiss }: DreamyOverlayProps) {
  const [voiceStatus, setVoiceStatus] = useState<OverlayVoiceStatus>('idle');
  const [responseText, setResponseText] = useState<string | null>(null);
  const audioRef = useRef<AudioService | null>(null);
  const clientRef = useRef(new ApiClient(engageAI.config));
  const micPointerDownRef = useRef(false);
  const isRecordingRef = useRef(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const getAudio = () => {
    if (!audioRef.current) audioRef.current = new AudioService({ Audio, FileSystem });
    return audioRef.current;
  };

  // Mic button pulse while listening
  useEffect(() => {
    if (voiceStatus === 'listening') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.12, duration: 500, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        ]),
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [voiceStatus]);

  // Play welcome TTS when overlay opens
  useEffect(() => {
    if (!visible) return;
    setResponseText(null);
    let cancelled = false;
    (async () => {
      try {
        const base64 = await clientRef.current.synthesizeSpeech(welcomeMessage);
        if (cancelled) return;
        setVoiceStatus('speaking');
        await getAudio().playBase64Audio(base64);
        if (!cancelled) setVoiceStatus('idle');
      } catch { setVoiceStatus('idle'); }
    })();
    return () => {
      cancelled = true;
      audioRef.current?.stopPlayback();
      if (isRecordingRef.current) {
        audioRef.current?.stopRecording().catch(() => {});
        isRecordingRef.current = false;
      }
      setVoiceStatus('idle');
    };
  }, [visible]);

  const doStopAndProcess = useCallback(async () => {
    if (!isRecordingRef.current) return;
    isRecordingRef.current = false;
    const audio = getAudio();
    setVoiceStatus('processing');
    try {
      const { uri } = await audio.stopRecording();
      const ext = uri.split('.').pop()?.toLowerCase() ?? 'm4a';
      const transcript = await clientRef.current.transcribeFromUri(uri, ext);
      if (!transcript.trim()) { setVoiceStatus('idle'); return; }
      const action = await engageAI.sendMessage(transcript);
      if (action.message) {
        setResponseText(action.message);
        const base64 = await clientRef.current.synthesizeSpeech(action.message);
        setVoiceStatus('speaking');
        await audio.playBase64Audio(base64);
      }
      setVoiceStatus('idle');
    } catch {
      setVoiceStatus('idle');
    }
  }, [engageAI]);

  const doStopRef = useRef(doStopAndProcess);
  doStopRef.current = doStopAndProcess;

  const handleMicPressIn = useCallback(async () => {
    if (voiceStatus === 'processing') return;
    const audio = getAudio();
    audio.stopPlayback();
    setVoiceStatus('idle');
    micPointerDownRef.current = true;

    const granted = await audio.requestPermissions();
    if (!granted) { micPointerDownRef.current = false; return; }
    try {
      await audio.startRecording();
      isRecordingRef.current = true;
      Vibration.vibrate(50);
      setVoiceStatus('listening');
      if (!micPointerDownRef.current) doStopRef.current();
    } catch {
      micPointerDownRef.current = false;
    }
  }, [voiceStatus]);

  const handleMicPressOut = useCallback(() => {
    micPointerDownRef.current = false;
    doStopRef.current();
  }, []);

  const displayText = responseText ?? welcomeMessage;

  const micLabel = voiceStatus === 'listening' ? 'Release to send'
    : voiceStatus === 'processing' ? 'Processing…'
    : 'Hold to speak';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={overlayStyles.backdrop} onPress={onDismiss}>
        <Pressable style={overlayStyles.content} onPress={(e) => e.stopPropagation()}>
          {/* Orb */}
          <View style={[overlayStyles.orb, { shadowColor: primaryColor }]}>
            <Text style={overlayStyles.orbEmoji}>
              {voiceStatus === 'listening' ? '👂' : voiceStatus === 'speaking' ? '🗣️' : '🤖'}
            </Text>
          </View>

          <View style={{ height: 28 }} />

          {/* Message */}
          <Text style={overlayStyles.messageText}>{displayText}</Text>

          <View style={{ height: 28 }} />

          {/* Mic button */}
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <Pressable
              onPressIn={handleMicPressIn}
              onPressOut={handleMicPressOut}
              disabled={voiceStatus === 'processing'}
              style={[
                overlayStyles.micBtn,
                { backgroundColor: voiceStatus === 'listening' ? '#e53e3e' : primaryColor },
              ]}
            >
              <Text style={overlayStyles.micIcon}>
                {voiceStatus === 'processing' ? '⏳' : voiceStatus === 'listening' ? '⏹' : '🎤'}
              </Text>
            </Pressable>
          </Animated.View>

          <Text style={overlayStyles.micLabel}>{micLabel}</Text>

          <View style={{ height: 20 }} />

          <TouchableOpacity onPress={onOpenChat}>
            <Text style={overlayStyles.openChatLink}>Open full chat →</Text>
          </TouchableOpacity>

          <View style={{ height: 8 }} />
          <Text style={overlayStyles.dismissHint}>Tap anywhere to dismiss</Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  outerRing: { borderWidth: 2, alignItems: 'center', justifyContent: 'center', opacity: 0.95 },
  fab: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden', elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 6 },
  riveContainer: { width: '100%', height: '100%', overflow: 'hidden' },
  rive: { flex: 1 },
  placeholder: { flex: 1, borderRadius: 999 },
});

const overlayStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center' },
  content: { alignItems: 'center', paddingHorizontal: 32 },
  orb: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 30, elevation: 12 },
  orbEmoji: { fontSize: 52 },
  messageText: { color: '#fff', fontSize: 18, fontWeight: '500', lineHeight: 28, textAlign: 'center', maxWidth: 280 },
  micBtn: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', elevation: 8, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 20 },
  micIcon: { fontSize: 28 },
  micLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 10 },
  openChatLink: { color: 'rgba(255,255,255,0.45)', fontSize: 13, textDecorationLine: 'underline' },
  dismissHint: { color: 'rgba(255,255,255,0.3)', fontSize: 12 },
});
