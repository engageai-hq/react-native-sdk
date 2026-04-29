import { EngageAIConfig, AgentAction, EngageUserContext } from '../models';

// ─── Response types ───────────────────────────────────────────────────────────

export interface ChatApiResponse {
  sessionId: string;
  action: AgentAction;
  conversationLength: number;
}

export class EngageAIApiException extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly path: string,
    message: string,
  ) {
    super(`EngageAIApiException(${statusCode} on ${path}): ${message}`);
    this.name = 'EngageAIApiException';
  }
}

// ─── Client ───────────────────────────────────────────────────────────────────

export class ApiClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  private readonly timeoutMs: number;

  constructor(private readonly config: EngageAIConfig) {
    this.baseUrl = config.serverUrl.replace(/\/$/, '');
    this.headers = {
      'Content-Type': 'application/json',
      'X-EngageAI-Key': config.apiKey,
    };
    this.timeoutMs = (config.timeoutSeconds ?? 30) * 1000;
  }

  /** Register the app manifest. Throws on failure; returns character URL or null. */
  async registerManifest(manifest: Record<string, unknown>): Promise<string | null> {
    const data = await this.post<{ success: boolean; character_url?: string }>(
      '/api/v1/register',
      { manifest },
    );
    if (!data.success) {
      throw new Error('Failed to register manifest with EngageAI server');
    }
    return data.character_url ?? null;
  }

  /** Send a chat message and get the agent response. */
  async sendMessage(opts: {
    sessionId: string;
    message: string;
    userContext?: EngageUserContext;
  }): Promise<ChatApiResponse> {
    const body: Record<string, unknown> = {
      session_id: opts.sessionId,
      app_id: this.config.appId,
      message: opts.message,
    };
    if (opts.userContext) body['user_context'] = opts.userContext;
    const data = await this.post<Record<string, unknown>>('/api/v1/chat', body);
    return this.parseChatResponse(data);
  }

  /** Send function execution results back to the agent. */
  async sendFunctionResults(opts: {
    sessionId: string;
    results: Array<Record<string, unknown>>;
  }): Promise<ChatApiResponse> {
    const data = await this.post<Record<string, unknown>>('/api/v1/results', {
      session_id: opts.sessionId,
      app_id: this.config.appId,
      results: opts.results,
    });
    return this.parseChatResponse(data);
  }

  /** Confirm or deny a pending action. */
  async sendConfirmation(opts: {
    sessionId: string;
    confirmed: boolean;
    callId?: string;
  }): Promise<ChatApiResponse> {
    const body: Record<string, unknown> = {
      session_id: opts.sessionId,
      app_id: this.config.appId,
      confirmed: opts.confirmed,
    };
    if (opts.callId) body['call_id'] = opts.callId;
    const data = await this.post<Record<string, unknown>>('/api/v1/confirm', body);
    return this.parseChatResponse(data);
  }

  /**
   * Transcribe audio from a file URI (React Native FormData upload).
   * Returns the transcribed text string.
   */
  async transcribeFromUri(uri: string, format: string): Promise<string> {
    const url = `${this.baseUrl}/api/v1/voice/transcribe`;
    const formData = new FormData();
    formData.append('file', { uri, type: `audio/${format}`, name: `audio.${format}` } as any);
    formData.append('language', 'en');

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'X-EngageAI-Key': this.config.apiKey },
      body: formData,
    });

    if (!response.ok) throw new Error(`Transcription failed: ${response.status}`);
    const data = await response.json();
    return (data.text as string) ?? '';
  }

  /** Convert text to speech — fetches binary MP3 and returns it as base64. */
  async synthesizeSpeech(text: string, voice = 'nova'): Promise<string> {
    const url = `${this.baseUrl}/api/v1/voice/synthesize`;
    const response = await fetch(url, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ text, voice, speed: 1.0 }),
    });

    if (!response.ok) throw new Error(`TTS failed: ${response.status}`);

    // Convert binary MP3 response to base64
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  /** Full single-round-trip voice chat (legacy — use transcribeFromUri + sendMessage + synthesizeSpeech instead). */
  async processVoiceChat(opts: {
    sessionId: string;
    audioBase64: string;
    audioFormat?: string;
    voice?: string;
    userContext?: Record<string, unknown>;
  }): Promise<VoiceChatResult> {
    const body: Record<string, unknown> = {
      session_id: opts.sessionId,
      app_id: this.config.appId,
      audio_base64: opts.audioBase64,
      audio_format: opts.audioFormat ?? 'wav',
      voice: opts.voice ?? 'nova',
    };
    if (opts.userContext) body['user_context'] = opts.userContext;
    const data = await this.post<Record<string, unknown>>('/api/v1/voice/chat', body);
    return {
      sessionId: data['session_id'] as string,
      transcription: (data['transcription'] as string) ?? '',
      responseText: (data['response_text'] as string) ?? '',
      audioBase64: (data['audio_base64'] as string) ?? '',
      actionType: (data['action_type'] as string) ?? 'respond',
      requiresConfirmation: (data['requires_confirmation'] as boolean) ?? false,
    };
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  private async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    if (this.config.debug) {
      console.log(`[EngageAI] POST ${path}`, body);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    const text = await response.text();

    if (this.config.debug) {
      console.log(`[EngageAI] Response ${response.status}:`, text);
    }

    if (response.ok) {
      return JSON.parse(text) as T;
    }

    throw new EngageAIApiException(response.status, path, text);
  }

  private parseChatResponse(data: Record<string, unknown>): ChatApiResponse {
    const raw = data['action'] as Record<string, unknown>;
    const action: AgentAction = {
      actionType: raw['action_type'] as AgentAction['actionType'],
      message: (raw['message'] as string) ?? null,
      functionCalls: (raw['function_calls'] as Array<Record<string, unknown>> ?? []).map((fc) => ({
        functionName: fc['function_name'] as string,
        arguments: fc['arguments'] as Record<string, unknown>,
        callId: fc['call_id'] as string,
      })),
    };
    return {
      sessionId: data['session_id'] as string,
      action,
      conversationLength: (data['conversation_length'] as number) ?? 0,
    };
  }
}

// ─── Voice result ─────────────────────────────────────────────────────────────

export interface VoiceChatResult {
  sessionId: string;
  transcription: string;
  responseText: string;
  audioBase64: string;
  actionType: string;
  requiresConfirmation: boolean;
}
