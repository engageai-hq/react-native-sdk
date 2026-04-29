// ─── Config ──────────────────────────────────────────────────────────────────

export interface EngageAIConfig {
  serverUrl: string;
  appId: string;
  apiKey: string;
  appName: string;
  domain?: string;
  description?: string;
  debug?: boolean;
  timeoutSeconds?: number;
}

// ─── User context ─────────────────────────────────────────────────────────────

export interface EngageUserContext {
  userId: string;
  displayName?: string;
  data?: Record<string, unknown>;
}

// ─── Functions ───────────────────────────────────────────────────────────────

export type FunctionHandler = (params: Record<string, unknown>) => Promise<unknown>;

export interface AppFunction {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  handler: FunctionHandler;
  requiresConfirmation?: boolean;
}

// ─── Agent actions ────────────────────────────────────────────────────────────

export type AgentActionType = 'respond' | 'function_call' | 'confirm' | 'clarify' | 'error';

export interface FunctionCallRequest {
  functionName: string;
  arguments: Record<string, unknown>;
  callId: string;
}

export interface AgentAction {
  actionType: AgentActionType;
  message: string | null;
  functionCalls: FunctionCallRequest[];
}

// ─── Chat messages ────────────────────────────────────────────────────────────

export type MessageSender = 'user' | 'agent';

export interface ChatMessage {
  id: string;
  content: string;
  sender: MessageSender;
  timestamp: Date;
  isConfirmation?: boolean;
}
