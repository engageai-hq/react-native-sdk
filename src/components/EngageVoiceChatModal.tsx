import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { EngageAI } from '../core/EngageAI';
import { useEngageAI } from '../hooks/useEngageAI';
import { ChatMessage } from '../models';
import type RiveModule from 'rive-react-native';
import type { RiveRef } from 'rive-react-native';
import type { ExpoAudio, ExpoFileSystem } from '../services/AudioService';
import { AudioService } from '../services/AudioService';
import { ApiClient } from '../services/ApiClient';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export interface EngageVoiceChatModalProps {
  visible: boolean;
  onClose: () => void;
  engageAI: EngageAI;
  /** Pass `Rive` from `import Rive from 'rive-react-native'`. Omit to show a plain placeholder. */
  Rive?: typeof RiveModule;
  /** Pass `Audio` from `import { Audio } from 'expo-av'` */
  Audio: ExpoAudio;
  /** Pass `* as FileSystem` from `import * as FileSystem from 'expo-file-system'` */
  FileSystem: ExpoFileSystem;
  primaryColor?: string;
  title?: string;
  welcomeMessage?: string;
}

type VoiceStatus = 'idle' | 'listening' | 'processing' | 'speaking';

/**
 * Full-screen bottom sheet with voice + text chat powered by EngageAI.
 *
 * ```tsx
 * import Rive from 'rive-react-native';
 * import { Audio } from 'expo-av';
 *
 * <EngageVoiceChatModal
 *   visible={open}
 *   onClose={() => setOpen(false)}
 *   engageAI={engageAI}
 *   Rive={Rive}
 *   Audio={Audio}
 *   primaryColor="#00C07F"
 *   title="PalmPay AI"
 *   welcomeMessage="Hi! How can I help you today?"
 * />
 * ```
 */
export function EngageVoiceChatModal({
  visible,
  onClose,
  engageAI,
  Rive,
  Audio,
  FileSystem,
  primaryColor = '#00C07F',
  title = 'EngageAI',
  welcomeMessage,
}: EngageVoiceChatModalProps) {
  const { messages, status, sendMessage, confirm, deny } = useEngageAI(engageAI);
  const [textInput, setTextInput] = useState('');
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>('idle');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const audioRef = useRef<AudioService | null>(null);
  const clientRef = useRef<ApiClient>(new ApiClient(engageAI.config));
  const riveRef = useRef<RiveRef>(null);
  const [riveLoaded, setRiveLoaded] = useState(false);
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  // Slide in/out animation
  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: visible ? 0 : SCREEN_HEIGHT,
      tension: 65,
      friction: 11,
      useNativeDriver: true,
    }).start();
  }, [visible]);

  // Auto-scroll to bottom when messages arrive
  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages]);

  const setRiveState = useCallback((listening: boolean, talking: boolean) => {
    const r = riveRef.current;
    if (!r) return;
    try {
      r.setInputState('State Machine 1', 'isListening', listening);
      r.setInputState('State Machine 1', 'isTalking', talking);
    } catch { /* ignore if state machine not ready yet */ }
  }, []);

  const getAudio = (): AudioService => {
    if (!audioRef.current) {
      audioRef.current = new AudioService({ Audio, FileSystem });
    }
    return audioRef.current;
  };

  const handleSendText = useCallback(async () => {
    const text = textInput.trim();
    if (!text) return;
    setTextInput('');
    await sendMessage(text);
  }, [textInput, sendMessage]);

  const handleMicPress = useCallback(async () => {
    const audio = getAudio();
    setVoiceError(null);

    if (voiceStatus === 'listening') {
      setVoiceStatus('processing');
      setRiveState(true, false); // thinking
      try {
        const { uri } = await audio.stopRecording();
        const ext = uri.split('.').pop()?.toLowerCase() ?? 'm4a';

        const transcript = await clientRef.current.transcribeFromUri(uri, ext);
        if (!transcript.trim()) {
          setVoiceError("Didn't catch that — try again");
          setVoiceStatus('idle');
          setRiveState(false, false);
          return;
        }

        const action = await engageAI.sendMessage(transcript);

        const responseText = action.message;
        if (responseText) {
          const audioBase64 = await clientRef.current.synthesizeSpeech(responseText);
          setVoiceStatus('speaking');
          setRiveState(false, true); // talking
          await audio.playBase64Audio(audioBase64);
        }
        setVoiceStatus('idle');
        setRiveState(false, false); // idle
      } catch (err) {
        console.error('[EngageAI] Voice error:', err);
        setVoiceError(String(err));
        setVoiceStatus('idle');
        setRiveState(false, false);
      }
      return;
    }

    // Start recording
    const granted = await audio.requestPermissions();
    if (!granted) {
      setVoiceError('Microphone permission denied');
      return;
    }
    try {
      await audio.startRecording();
      setVoiceStatus('listening');
      setRiveState(true, false); // listening
    } catch (err) {
      console.error('[EngageAI] Start recording error:', err);
      setVoiceError(String(err));
      setVoiceStatus('idle');
    }
  }, [voiceStatus, engageAI, setRiveState]);

  const handleStopSpeaking = useCallback(async () => {
    await audioRef.current?.stopPlayback();
    setVoiceStatus('idle');
  }, []);

  const characterState =
    voiceStatus === 'listening' ? 'listening'
    : voiceStatus === 'processing' || status === 'sending' || status === 'executing' ? 'thinking'
    : voiceStatus === 'speaking' ? 'talking'
    : 'idle';

  const displayMessages: ChatMessage[] = welcomeMessage
    ? [
        {
          id: '__welcome__',
          content: welcomeMessage,
          sender: 'agent',
          timestamp: new Date(0),
        },
        ...messages,
      ]
    : messages;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <Animated.View
        style={[
          styles.sheet,
          { transform: [{ translateY: slideAnim }] },
        ]}
      >
        {/* Handle */}
        <View style={styles.handle} />

        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: primaryColor }]}>{title}</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Character */}
        <View style={styles.characterContainer}>
          {Rive && engageAI.characterUrl ? (
            <Rive
              ref={riveRef}
              url={engageAI.characterUrl}
              stateMachines="State Machine 1"
              autoplay
              style={styles.character}
              onError={(err: any) => console.error('[EngageAI] Rive error:', err)}
              onPlay={(animName: string) => {
                if (animName === 'State Machine 1') setRiveLoaded(true);
              }}
            />
          ) : (
            <View style={[styles.characterPlaceholder, { backgroundColor: `${primaryColor}15`, borderColor: `${primaryColor}40`, borderWidth: 2 }]}>
              <Text style={[styles.characterEmoji, { color: primaryColor }]}>
                {characterState === 'listening' ? '🎙' : characterState === 'thinking' ? '💭' : characterState === 'talking' ? '💬' : '✨'}
              </Text>
            </View>
          )}

          {/* Status chip */}
          <TouchableOpacity
            onPress={voiceStatus === 'speaking' ? handleStopSpeaking : undefined}
            style={[styles.statusChip, { backgroundColor: `${primaryColor}22` }]}
          >
            <Text style={[styles.statusText, { color: primaryColor }]}>
              {statusLabel(voiceStatus, status)}
            </Text>
          </TouchableOpacity>
          {voiceError && (
            <Text style={styles.voiceErrorText}>⚠ {voiceError}</Text>
          )}
        </View>

        {/* Messages */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}
          keyboardVerticalOffset={20}
        >
          <ScrollView
            ref={scrollRef}
            style={styles.messages}
            contentContainerStyle={styles.messagesContent}
            showsVerticalScrollIndicator={false}
          >
            {displayMessages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} primaryColor={primaryColor} />
            ))}

            {/* Confirmation buttons */}
            {messages[messages.length - 1]?.isConfirmation && (
              <View style={styles.confirmRow}>
                <TouchableOpacity
                  style={[styles.confirmBtn, { backgroundColor: primaryColor }]}
                  onPress={confirm}
                >
                  <Text style={styles.confirmBtnText}>Confirm</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.confirmBtn, styles.denyBtn]}
                  onPress={deny}
                >
                  <Text style={[styles.confirmBtnText, styles.denyBtnText]}>Cancel</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>

          {/* Input row */}
          <View style={styles.inputRow}>
            <TextInput
              style={styles.textInput}
              value={textInput}
              onChangeText={setTextInput}
              placeholder="Type a message…"
              placeholderTextColor="#999"
              returnKeyType="send"
              onSubmitEditing={handleSendText}
              multiline
            />
            <TouchableOpacity
              style={[styles.micBtn, { backgroundColor: primaryColor }, voiceStatus === 'listening' && styles.micActive]}
              onPress={handleMicPress}
              disabled={status === 'sending' || status === 'executing'}
            >
              <Text style={styles.micIcon}>{voiceStatus === 'listening' ? '⏹' : '🎤'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sendBtn, { backgroundColor: primaryColor }]}
              onPress={handleSendText}
              disabled={!textInput.trim() || status === 'sending'}
            >
              <Text style={styles.sendIcon}>➤</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Animated.View>
    </Modal>
  );
}

// ─── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ message, primaryColor }: { message: ChatMessage; primaryColor: string }) {
  const isUser = message.sender === 'user';
  return (
    <View style={[styles.bubbleWrapper, isUser ? styles.bubbleRight : styles.bubbleLeft]}>
      <View
        style={[
          styles.bubble,
          isUser
            ? [styles.bubbleUser, { backgroundColor: primaryColor }]
            : styles.bubbleAgent,
        ]}
      >
        <Text style={[styles.bubbleText, isUser && styles.bubbleTextUser]}>
          {message.content}
        </Text>
      </View>
    </View>
  );
}

function statusLabel(voice: VoiceStatus, send: string): string {
  if (voice === 'listening') return '● Listening…';
  if (voice === 'processing') return '⟳ Processing…';
  if (voice === 'speaking') return '▶ Speaking — tap to stop';
  if (send === 'sending' || send === 'executing') return '⟳ Thinking…';
  return '● Ready';
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: SCREEN_HEIGHT * 0.88,
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ddd',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
  },
  closeBtn: {
    padding: 8,
  },
  closeBtnText: {
    fontSize: 16,
    color: '#999',
  },
  characterContainer: {
    alignItems: 'center',
    paddingBottom: 8,
  },
  character: {
    width: 180,
    height: 180,
  },
  characterPlaceholder: {
    width: 180,
    height: 180,
    borderRadius: 90,
    alignItems: 'center',
    justifyContent: 'center',
  },
  characterEmoji: {
    fontSize: 72,
  },
  statusChip: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 4,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '500',
  },
  voiceErrorText: {
    fontSize: 12,
    color: '#e53e3e',
    marginTop: 4,
    paddingHorizontal: 16,
    textAlign: 'center',
  },
  flex: {
    flex: 1,
  },
  messages: {
    flex: 1,
    paddingHorizontal: 16,
  },
  messagesContent: {
    paddingVertical: 12,
    gap: 8,
  },
  bubbleWrapper: {
    flexDirection: 'row',
    marginVertical: 2,
  },
  bubbleLeft: {
    justifyContent: 'flex-start',
  },
  bubbleRight: {
    justifyContent: 'flex-end',
  },
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  bubbleUser: {
    borderBottomRightRadius: 4,
  },
  bubbleAgent: {
    backgroundColor: '#f1f1f1',
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    fontSize: 15,
    color: '#333',
    lineHeight: 20,
  },
  bubbleTextUser: {
    color: '#fff',
  },
  confirmRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
    paddingHorizontal: 8,
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  denyBtn: {
    backgroundColor: '#f1f1f1',
  },
  confirmBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
  denyBtnText: {
    color: '#666',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    gap: 8,
  },
  textInput: {
    flex: 1,
    minHeight: 42,
    maxHeight: 100,
    backgroundColor: '#f5f5f5',
    borderRadius: 21,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: '#333',
  },
  micBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micActive: {
    opacity: 0.7,
  },
  micIcon: {
    fontSize: 18,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendIcon: {
    fontSize: 16,
    color: '#fff',
  },
});
