<?php

namespace App\Support;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Optional LLM assist. Tries each configured provider in order (Gemini → Groq → local Ollama), all through the
 * OpenAI chat-completions format, so no SDK is needed. Never on the alert or routing critical path.
 */
class Llm
{
    /** @return array<string, array{url: string, key: string, model: string}> */
    public static function providers(): array
    {
        return array_filter(config('services.llm'), fn (array $p) => ! empty($p['key']) && ! empty($p['url']));
    }

    public static function enabled(): bool
    {
        return self::providers() !== [];
    }

    /** @return array{text: string, provider: string}|null null when no provider answered */
    public static function chat(string $system, string $user): ?array
    {
        foreach (self::providers() as $name => $p) {
            try {
                $text = Http::withToken($p['key'])->timeout(30)->post($p['url'], [
                    'model' => $p['model'],
                    'temperature' => 0.2,
                    'messages' => [['role' => 'system', 'content' => $system], ['role' => 'user', 'content' => $user]],
                ])->throw()->json('choices.0.message.content');
                if (is_string($text) && trim($text) !== '') {
                    return ['text' => trim($text), 'provider' => $name];
                }
            } catch (Throwable $e) {
                Log::warning("LLM provider {$name} failed: {$e->getMessage()}"); // fall through to the next provider
            }
        }

        return null;
    }
}
