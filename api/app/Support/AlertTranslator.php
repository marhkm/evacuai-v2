<?php

namespace App\Support;

/** Cebuano and Filipino versions of an officer-written alert, for the officer to review and edit before broadcast. */
class AlertTranslator
{
    private const SYSTEM = 'You translate short emergency alerts for a university in Cebu, Philippines. '
        .'Keep every room code, building name, stair name, exit name and number exactly as written. Use plain, calm, direct words. '
        .'Reply with JSON only, no markdown: {"ceb": "<Cebuano>", "fil": "<Filipino>"}';

    /** Free-tier providers may train on prompts: strip contact details before sending (officers are told not to type names). */
    public static function redact(string $text): string
    {
        $text = (string) preg_replace('/[\w.+-]+@[\w-]+(\.[\w-]+)+/u', '[email]', $text);

        return (string) preg_replace('/(\+?63|0)9\d{2}[\s-]?\d{3}[\s-]?\d{4}|\b\d{7,}\b/', '[number]', $text);
    }

    /** @return array{ceb: string, fil: string, provider: string}|null */
    public static function translate(string $message): ?array
    {
        $reply = Llm::chat(self::SYSTEM, self::redact($message));
        if (! $reply) {
            return null;
        }
        $json = json_decode((string) preg_replace('/^```(?:json)?\s*|\s*```$/', '', $reply['text']), true);
        if (! is_array($json) || ! is_string($json['ceb'] ?? null) || ! is_string($json['fil'] ?? null)) {
            return null;
        }

        return [
            'ceb' => mb_substr(trim($json['ceb']), 0, 600),
            'fil' => mb_substr(trim($json['fil']), 0, 600),
            'provider' => $reply['provider'],
        ];
    }
}
