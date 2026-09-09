export type Provider = 'openai' | 'anthropic';
export type Engine = 'MA' | 'MEDSUP' | 'ACA' | 'U65' | 'ANCILLARY' | 'ANNUITY';
// Provider payloads are JSON; adapters are the only place that handles SDK types.
export type Json = Record<string, any>;
export interface CompletionRequest {
  engine: Engine;
  path?: 'live' | 'summary';
  system: string | Json[];
  static_messages?: Json[];
  messages: Json[];
  max_completion_tokens?: number;
  tools?: Json[];
  tool_choice?: Json | string;
  response_format?: { type: 'json_schema'; json_schema: { name: string; strict: true; schema: Json } };
}
export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  reasoning_tokens: number;
}
export interface Completion {
  id: string;
  model: string;
  content: Json[];
  tool_calls: Json[];
  stop_reason: 'end_turn' | 'tool_use' | 'max_tokens' | 'degraded';
  usage: Usage;
  parsed?: Json;
  degraded?: boolean;
  error_code?: string;
}
export interface Adapter {
  complete(request: CompletionRequest, model: string, signal: AbortSignal): Promise<Completion>;
  stream(request: CompletionRequest, model: string, signal: AbortSignal): AsyncIterable<Json>;
}
export interface Runtime {
  env?: Record<string, string | undefined>;
  adapters?: Record<Provider, Adapter>;
  telemetry?: (row: Json) => Promise<void>;
  waitUntil?: (task: Promise<unknown>) => void;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  signal?: AbortSignal;
}
