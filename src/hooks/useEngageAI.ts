import { useState, useCallback, useRef, useEffect } from 'react';
import { EngageAI } from '../core/EngageAI';
import { ChatMessage, AgentAction } from '../models';

export type ConversationStatus =
  | 'idle'
  | 'sending'
  | 'executing'
  | 'speaking'
  | 'listening'
  | 'error';

export interface UseEngageAIResult {
  messages: ChatMessage[];
  status: ConversationStatus;
  lastAction: AgentAction | null;
  error: string | null;
  sendMessage: (text: string) => Promise<void>;
  confirm: () => Promise<void>;
  deny: () => Promise<void>;
  resetSession: () => void;
  clearError: () => void;
}

/**
 * React hook that manages an EngageAI conversation.
 *
 * @example
 * ```tsx
 * const { messages, sendMessage, status, confirm, deny } = useEngageAI(engageAI);
 * ```
 */
export function useEngageAI(engageAI: EngageAI): UseEngageAIResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ConversationStatus>('idle');
  const [lastAction, setLastAction] = useState<AgentAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Keep a stable ref so callbacks don't go stale
  const aiRef = useRef(engageAI);
  aiRef.current = engageAI;

  useEffect(() => {
    engageAI.onMessagesChanged = (msgs) => setMessages([...msgs]);
    engageAI.onFunctionExecuting = () => setStatus('executing');
    engageAI.onAgentAction = (action) => {
      setLastAction(action);
      setStatus('idle');
    };

    return () => {
      engageAI.onMessagesChanged = undefined;
      engageAI.onFunctionExecuting = undefined;
      engageAI.onAgentAction = undefined;
    };
  }, [engageAI]);

  const sendMessage = useCallback(async (text: string) => {
    setError(null);
    setStatus('sending');
    try {
      await aiRef.current.sendMessage(text);
    } catch (err) {
      setError(String(err));
      setStatus('error');
    }
  }, []);

  const confirm = useCallback(async () => {
    setError(null);
    setStatus('sending');
    try {
      await aiRef.current.confirm();
    } catch (err) {
      setError(String(err));
      setStatus('error');
    }
  }, []);

  const deny = useCallback(async () => {
    setError(null);
    setStatus('sending');
    try {
      await aiRef.current.deny();
    } catch (err) {
      setError(String(err));
      setStatus('error');
    }
  }, []);

  const resetSession = useCallback(() => {
    aiRef.current.resetSession();
    setMessages([]);
    setStatus('idle');
    setLastAction(null);
    setError(null);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
    setStatus('idle');
  }, []);

  return { messages, status, lastAction, error, sendMessage, confirm, deny, resetSession, clearError };
}
