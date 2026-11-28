<?php

// The photo check runs on the queue-ai worker: it must see the same uploaded photos as the app, or every check ends
// as "AI: not available" without the AI ever being asked (testers' BUG-006, found on the test server).
it('gives the photo-check worker the uploaded photos, like the app', function () {
    $compose = file_get_contents(base_path('../docker/compose.yml'));
    $service = fn (string $name) => preg_match('/^  '.preg_quote($name, '/').':[^\n]*\n((?:    .*\n|\s*\n)*)/m', $compose, $m) ? $m[1] : '';

    expect($service('app'))->toContain('uploads:/app/storage/app/private')
        ->and($service('queue-ai'))->toContain('uploads:/app/storage/app/private');
});
