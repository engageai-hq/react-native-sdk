// ─── Models ──────────────────────────────────────────────────────────────────
export * from './models';

// ─── Core ─────────────────────────────────────────────────────────────────────
export { EngageAI } from './core/EngageAI';

// ─── Services ────────────────────────────────────────────────────────────────
export { ApiClient } from './services/ApiClient';
export type { ChatApiResponse, VoiceChatResult } from './services/ApiClient';
export { EngageAIApiException } from './services/ApiClient';
export { AudioService } from './services/AudioService';
export type { AudioServiceConfig, ExpoAudio, ExpoFileSystem } from './services/AudioService';

// ─── Hooks ───────────────────────────────────────────────────────────────────
export { useEngageAI } from './hooks/useEngageAI';
export type { UseEngageAIResult, ConversationStatus } from './hooks/useEngageAI';
export { useVoiceChat } from './hooks/useVoiceChat';
export type { UseVoiceChatResult, VoiceStatus } from './hooks/useVoiceChat';

// ─── Components ──────────────────────────────────────────────────────────────
export { EngageCharacterFab } from './components/EngageCharacterFab';
export type { EngageCharacterFabProps, CharacterState } from './components/EngageCharacterFab';
export { EngageVoiceChatModal } from './components/EngageVoiceChatModal';
export type { EngageVoiceChatModalProps } from './components/EngageVoiceChatModal';
