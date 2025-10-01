import Anthropic from '@anthropic-ai/sdk';
export declare const anthropic: Anthropic;
/**
 * Send a prompt to Claude and get a response
 */
export declare function askClaude(prompt: string, systemPrompt?: string): Promise<string>;
/**
 * Send a prompt to Claude with JSON mode enabled
 */
export declare function askClaudeJSON<T>(prompt: string, systemPrompt?: string): Promise<T>;
/**
 * Generate a UUID v4
 */
export declare function generateUUID(): string;
//# sourceMappingURL=claude.d.ts.map