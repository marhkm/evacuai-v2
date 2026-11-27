<?php

namespace App\Support;

/** Cebuano and Filipino versions of an officer-written alert, for the officer to review and edit before broadcast. */
class AlertTranslator
{
    // Worked examples anchor small local models, which otherwise drift in Cebuano (testers' BUG-001). Officers still
    // check every translation before broadcasting (the Command Center says so).
    private const SYSTEM = 'You translate short emergency alerts for a university in Cebu, Philippines, from English into Cebuano (Bisaya) and Filipino. '
        .'Translate the meaning exactly. Do not add or leave out any instruction, place, number or warning. '
        .'Keep every room code, building name, stair name, exit name and number exactly as written. Use plain, calm, direct words. '
        .'Examples. English: "Fire on the 3rd floor of Annex 1. Evacuate now using the nearest stairs. Do not use the elevator." '
        .'Cebuano: "Sunog sa ikatulong andana sa Annex 1. Pag-evacuate karon dayon pinaagi sa pinakaduol nga hagdanan. Ayaw gamita ang elevator." '
        .'Filipino: "May sunog sa ikatlong palapag ng Annex 1. Lumikas na ngayon gamit ang pinakamalapit na hagdan. Huwag gumamit ng elevator." '
        .'English: "Earthquake. Drop, cover and hold on. When the shaking stops, go to Open Ground 2." '
        .'Cebuano: "Linog. Pagyukbo, pagtago, ug paggunit. Kung mohunong na ang pag-uyog, adto sa Open Ground 2." '
        .'Filipino: "Lindol. Yumuko, magtago, at kumapit. Kapag tumigil na ang pagyanig, pumunta sa Open Ground 2." '
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
