<?php

namespace App\Filament\Resources\Feedback\Pages;

use App\Filament\Resources\Feedback\FeedbackResource;
use App\Models\Feedback;
use Filament\Resources\Pages\ListRecords;

class ListFeedback extends ListRecords
{
    protected static string $resource = FeedbackResource::class;

    public function getSubheading(): ?string
    {
        $n = Feedback::count();

        return $n ? 'Average rating '.round((float) Feedback::avg('rating'), 2)." / 5 from {$n} ".str('response')->plural($n) : null;
    }
}
