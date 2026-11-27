<?php

use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Http;

// The AI photo check's accuracy for the paper: labelled photos in one folder per hazard (plus "none").
it('scores the photo check per hazard with precision, recall and F1', function () {
    config(['services.ollama.base' => 'http://ollama:11434']);
    $dir = sys_get_temp_dir().'/eval-'.uniqid();
    foreach (['fire/a.jpg', 'fire/b.jpg', 'none/c.jpg', 'none/d.jpg'] as $i => $f) {
        File::ensureDirectoryExists(dirname("{$dir}/{$f}"));
        file_put_contents("{$dir}/{$f}", hazardPhoto($i + 1)->getContent());
    }
    // fire/a yes (TP), fire/b no (FN), none/c no (TN), none/d yes (FP)
    Http::fakeSequence('ollama:11434/*')->push(['response' => 'Yes'])->push(['response' => 'No'])
        ->push(['response' => 'No'])->push(['response' => 'Yes']);

    $this->artisan('evacuai:evaluate-photos', ['folder' => $dir])
        ->expectsOutputToContain('mAP: not applicable')
        ->expectsTable(['Hazard', 'Photos', 'TP', 'FP', 'FN', 'TN', 'No answer', 'Precision', 'Recall', 'F1'], [
            ['fire', '4', '1', '1', '1', '1', '0', '0.50', '0.50', '0.50'],
        ])
        ->assertSuccessful();
    File::deleteDirectory($dir);
});

it('needs the AI to be set up', function () {
    config(['services.ollama.base' => null]);
    $this->artisan('evacuai:evaluate-photos', ['folder' => sys_get_temp_dir()])->assertFailed();
});
