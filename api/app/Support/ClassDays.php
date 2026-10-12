<?php

namespace App\Support;

use Illuminate\Support\Carbon;

/** Registrar day codes (ported from the student prototype): M T W TH F S SU, combined like "MWF" or "TTH". */
class ClassDays
{
    private const CODES = [1 => 'M', 2 => 'T', 3 => 'W', 4 => 'TH', 5 => 'F', 6 => 'S', 7 => 'SU'];

    /** @return list<string> */
    public static function parse(string $days): array
    {
        preg_match_all('/TH|SU|M|T|W|F|S/', strtoupper(str_replace(' ', '', $days)), $m);

        return $m[0];
    }

    public static function includes(string $days, Carbon $at): bool
    {
        return in_array(self::CODES[$at->isoWeekday()], self::parse($days), true);
    }

    public static function valid(string $days): bool
    {
        return self::parse($days) !== [] && implode('', self::parse($days)) === strtoupper(str_replace(' ', '', $days));
    }
}
