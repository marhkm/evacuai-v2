<?php

namespace App\Support;

use App\Models\HazardReport;

/** One- or two-sentence LLM summary of the recent reports matching a report's hazard and floor, for officers. */
class ReportSummary
{
    private const SYSTEM = 'You help a university safety officer in Cebu, Philippines read hazard reports during an emergency. '
        .'Summarize the reports in at most 2 short sentences: what is happening, exactly where (keep room, stair and exit names as written), '
        .'and how many people agree. Note clear disagreements. Reports may be in English, Cebuano or Filipino; answer in English. '
        .'No advice, no names, no markdown.';

    /** @return array{text: string, provider: string}|null null when no provider answered */
    public static function for(HazardReport $report): ?array
    {
        $reports = ReportClusters::recentReports($report->hazard_type, $report->building_id)
            ->where('hazard_reports.level', $report->level)
            ->oldest('hazard_reports.created_at')->limit(30)->get();

        // Free tiers may train on prompts: no reporter identities, contact details stripped from the free text.
        $lines = $reports->map(fn (HazardReport $r) => sprintf('- %s, %s%s: %s',
            $r->created_at?->timezone(config('evacuai.timezone'))->format('g:i A'),
            $r->room_id ? Places::humanize($r->room_id) : 'room not given',
            $r->photo_path ? ', with photo' : '',
            $r->description ? AlertTranslator::redact($r->description) : '(no description)',
        ));
        $prompt = 'Hazard: '.str_replace('_', ' ', $report->hazard_type)."\n"
            .'Place: '.Places::label($report->building_id, $report->level)."\n"
            .'Reports from '.$reports->unique('reported_by')->count()." different people:\n".$lines->implode("\n");

        $reply = Llm::chat(self::SYSTEM, $prompt);

        return $reply ? ['text' => mb_substr($reply['text'], 0, 500), 'provider' => $reply['provider']] : null;
    }
}
