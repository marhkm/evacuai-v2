<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Support\Str;

/** Restricts sign-ups to the configured domains (evacuai.allowed_email_domains); empty list allows all. */
class AllowedEmailDomain implements ValidationRule
{
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        $allowed = config('evacuai.allowed_email_domains', []);
        if ($allowed === [] || ! is_string($value)) {
            return;
        }
        if (! in_array(Str::lower(Str::after($value, '@')), array_map('strtolower', $allowed), true)) {
            $fail('Use your school email address ('.implode(', ', $allowed).').');
        }
    }
}
