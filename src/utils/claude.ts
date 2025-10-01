import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const apiKey = process.env.CLAUDE_API_KEY;
const model = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';

if (!apiKey) {
  throw new Error('CLAUDE_API_KEY not found in .env.local');
}

export const anthropic = new Anthropic({
  apiKey: apiKey,
});

/**
 * Send a prompt to Claude and get a response
 */
export async function askClaude(
  prompt: string,
  systemPrompt?: string
): Promise<string> {
  try {
    const message = await anthropic.messages.create({
      model: model,
      max_tokens: 8000,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const content = message.content[0];
    if (content.type === 'text') {
      return content.text;
    }

    throw new Error('Unexpected response type from Claude');
  } catch (error) {
    console.error('Error calling Claude API:', error);
    throw error;
  }
}

/**
 * Send a prompt to Claude with JSON mode enabled
 */
export async function askClaudeJSON<T>(
  prompt: string,
  systemPrompt?: string
): Promise<T> {
  const response = await askClaude(
    `${prompt}\n\nIMPORTANT: Return ONLY valid JSON, no markdown code blocks or explanations.`,
    systemPrompt
  );

  // Remove markdown code blocks if present
  let jsonText = response.trim();
  if (jsonText.startsWith('```json')) {
    jsonText = jsonText.replace(/^```json\s*/, '').replace(/```\s*$/, '');
  } else if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/^```\s*/, '').replace(/```\s*$/, '');
  }

  try {
    return JSON.parse(jsonText);
  } catch (error) {
    console.error('Failed to parse JSON response:', jsonText);
    throw new Error(`Claude returned invalid JSON: ${error}`);
  }
}


/**
 * Generate a UUID v4
 */
export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
