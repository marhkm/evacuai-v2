<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Feedback;
use App\Support\Activity;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class FeedbackController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'rating' => ['required', 'integer', 'between:1,5'],
            'comments' => ['nullable', 'string', 'max:1000'],
        ]);
        $feedback = Feedback::create($data + ['user_id' => $request->user()->id]);
        Activity::log('feedback_submitted', ['feedback_id' => $feedback->id, 'rating' => $feedback->rating]);

        return response()->json(['message' => 'Thank you for your feedback.'], 201);
    }
}
