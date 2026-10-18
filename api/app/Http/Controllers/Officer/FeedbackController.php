<?php

namespace App\Http\Controllers\Officer;

use App\Http\Controllers\Controller;
use App\Models\Feedback;
use Illuminate\Http\JsonResponse;

class FeedbackController extends Controller
{
    public function __invoke(): JsonResponse
    {
        $items = Feedback::with('user:id,name')->latest()->limit(200)->get();
        $stats = Feedback::query()->selectRaw('avg(rating) as avg, count(*) as n')->first();

        return response()->json([
            'average' => $stats?->getAttribute('n') ? round((float) $stats->getAttribute('avg'), 1) : null,
            'count' => (int) ($stats?->getAttribute('n') ?? 0),
            'items' => $items->map(fn (Feedback $f) => [
                'rating' => $f->rating,
                'comments' => $f->comments,
                'created_at' => $f->created_at?->toIso8601String(),
                'name' => $f->user?->name,
            ])->values(),
        ]);
    }
}
