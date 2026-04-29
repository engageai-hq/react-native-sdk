import { EngageAIConfig, EngageUserContext, AppFunction, AgentAction, ChatMessage, FunctionCallRequest } from '../models';
import { ApiClient } from '../services/ApiClient';

let _uuidCounter = 0;
function uuid(): string {
  return `${Date.now().toString(36)}-${(++_uuidCounter).toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function sessionId(): string {
  return `sess_${uuid().replace(/-/g, '').slice(0, 16)}`;
}

// ─── Main SDK class ───────────────────────────────────────────────────────────

export class EngageAI {
  private readonly _client: ApiClient;
  private readonly _functions = new Map<string, AppFunction>();
  private _messages: ChatMessage[] = [];
  private _sessionId: string;
  private _userContext?: EngageUserContext;
  private _initialized = false;
  private _characterUrl: string | null = null;

  /** Called whenever the agent responds. */
  onAgentAction?: (action: AgentAction) => void;

  /** Called when a function is being executed. */
  onFunctionExecuting?: (functionName: string) => void;

  /** Called whenever the message list changes. */
  onMessagesChanged?: (messages: ChatMessage[]) => void;

  constructor(readonly config: EngageAIConfig) {
    this._client = new ApiClient(config);
    this._sessionId = sessionId();
  }

  get isInitialized(): boolean {
    return this._initialized;
  }

  get currentSessionId(): string {
    return this._sessionId;
  }

  /** Character file URL from the server (enterprise = custom, others = default). */
  get characterUrl(): string | null {
    return this._characterUrl;
  }

  /** Read-only snapshot of the message history. */
  get messages(): ChatMessage[] {
    return [...this._messages];
  }

  /** Register a single function the agent can call. */
  registerFunction(fn: AppFunction): void {
    this._functions.set(fn.name, fn);
    if (this.config.debug) {
      console.log(`[EngageAI] Registered function: ${fn.name}`);
    }
  }

  /** Register multiple functions at once. */
  registerFunctions(fns: AppFunction[]): void {
    fns.forEach((fn) => this.registerFunction(fn));
  }

  /** Set the current user context (sent with every message). */
  setUserContext(ctx: EngageUserContext): void {
    this._userContext = ctx;
  }

  /**
   * Initialize the SDK by registering the manifest with the backend.
   * Must be called before sendMessage().
   */
  async initialize(): Promise<void> {
    if (this._functions.size === 0) {
      throw new Error('No functions registered. Call registerFunction() before initialize().');
    }

    const manifest = {
      app_id: this.config.appId,
      app_name: this.config.appName,
      version: '1.0.0',
      description: this.config.description ?? '',
      domain: this.config.domain ?? 'other',
      functions: Array.from(this._functions.values()).map((fn) => ({
        name: fn.name,
        description: fn.description,
        parameters: fn.parameters,
        requires_confirmation: fn.requiresConfirmation ?? false,
      })),
    };

    this._characterUrl = await this._client.registerManifest(manifest);
    this._initialized = true;

    if (this.config.debug) {
      console.log(`[EngageAI] Initialized with ${this._functions.size} functions`);
    }
  }

  /** Send a text message and process the full agent loop. */
  async sendMessage(text: string): Promise<AgentAction> {
    this._ensureInitialized();

    this._pushMessage({ content: text, sender: 'user' });

    const response = await this._client.sendMessage({
      sessionId: this._sessionId,
      message: text,
      userContext: this._userContext,
    });

    this._sessionId = response.sessionId;
    return this._handleAction(response.action);
  }

  /** Confirm a pending action. */
  async confirm(): Promise<AgentAction> {
    this._ensureInitialized();
    this._pushMessage({ content: 'Confirmed ✓', sender: 'user' });
    const response = await this._client.sendConfirmation({
      sessionId: this._sessionId,
      confirmed: true,
    });
    this._sessionId = response.sessionId;
    return this._handleAction(response.action);
  }

  /** Deny/cancel a pending action. */
  async deny(): Promise<AgentAction> {
    this._ensureInitialized();
    this._pushMessage({ content: 'Cancelled ✗', sender: 'user' });
    const response = await this._client.sendConfirmation({
      sessionId: this._sessionId,
      confirmed: false,
    });
    this._sessionId = response.sessionId;
    return this._handleAction(response.action);
  }

  /** Reset the conversation session (clears history). */
  resetSession(): void {
    this._sessionId = sessionId();
    this._messages = [];
    this._notifyMessages();
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private async _handleAction(action: AgentAction): Promise<AgentAction> {
    switch (action.actionType) {
      case 'respond':
      case 'clarify':
      case 'error':
        if (action.message) this._pushMessage({ content: action.message, sender: 'agent' });
        this.onAgentAction?.(action);
        return action;

      case 'confirm':
        if (action.message) {
          this._messages.push({
            id: uuid(),
            content: action.message,
            sender: 'agent',
            timestamp: new Date(),
            isConfirmation: true,
          });
          this._notifyMessages();
        }
        this.onAgentAction?.(action);
        return action;

      case 'function_call':
        if (action.message) this._pushMessage({ content: action.message, sender: 'agent' });
        return this._executeFunctions(action.functionCalls);
    }
  }

  private async _executeFunctions(calls: FunctionCallRequest[]): Promise<AgentAction> {
    const results: Array<Record<string, unknown>> = [];

    for (const call of calls) {
      const fn = this._functions.get(call.functionName);

      if (!fn) {
        results.push({
          call_id: call.callId,
          function_name: call.functionName,
          success: false,
          error: `Function "${call.functionName}" not registered in SDK`,
        });
        continue;
      }

      this.onFunctionExecuting?.(call.functionName);

      try {
        const result = await fn.handler(call.arguments);
        results.push({
          call_id: call.callId,
          function_name: call.functionName,
          success: true,
          result,
        });
      } catch (err) {
        results.push({
          call_id: call.callId,
          function_name: call.functionName,
          success: false,
          error: String(err),
        });
      }
    }

    const response = await this._client.sendFunctionResults({
      sessionId: this._sessionId,
      results,
    });

    this._sessionId = response.sessionId;
    return this._handleAction(response.action);
  }

  private _pushMessage(opts: { content: string; sender: 'user' | 'agent' }): void {
    this._messages.push({
      id: uuid(),
      content: opts.content,
      sender: opts.sender,
      timestamp: new Date(),
    });
    this._notifyMessages();
  }

  private _notifyMessages(): void {
    this.onMessagesChanged?.(this.messages);
  }

  private _ensureInitialized(): void {
    if (!this._initialized) {
      throw new Error('EngageAI not initialized. Call initialize() first.');
    }
  }
}
