<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    // Mobile sends a Google access token; the server verifies it via Socialite (userFromToken).
    // LLM assist (slice 8). Tried in this order; any provider without a key is skipped. All speak the OpenAI
    // chat-completions format. Free tiers may use prompts for training: never send personal data (see AlertTranslator).
    'llm' => [
        'gemini' => [
            'url' => 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
            'key' => env('GEMINI_API_KEY'),
            'model' => env('GEMINI_MODEL', 'gemini-2.5-flash'),
        ],
        'groq' => [
            'url' => 'https://api.groq.com/openai/v1/chat/completions',
            'key' => env('GROQ_API_KEY'),
            'model' => env('GROQ_MODEL', 'llama-3.3-70b-versatile'),
        ],
        'ollama' => [ // local model, docker compose --profile ai-local
            'url' => env('OLLAMA_URL') ? rtrim((string) env('OLLAMA_URL'), '/').'/v1/chat/completions' : null,
            'key' => env('OLLAMA_URL') ? 'ollama' : null,
            'model' => env('OLLAMA_MODEL', 'llama3.2'),
        ],
    ],

    // Microsoft 365 sign-in (slice 8): only accounts from this Entra tenant (UCLM's) are accepted.
    'microsoft' => [
        'tenant_id' => env('MICROSOFT_TENANT_ID'),
    ],

    'google' => [
        'client_id' => env('GOOGLE_CLIENT_ID'),
        'client_secret' => env('GOOGLE_CLIENT_SECRET'),
        'redirect' => env('GOOGLE_REDIRECT_URI', env('APP_URL').'/auth/google/callback'),
    ],

    // Optional SMS fallback (https://semaphore.co). Leave the key empty to disable.
    'semaphore' => [
        'key' => env('SEMAPHORE_API_KEY'),
        'sender' => env('SEMAPHORE_SENDER', 'EvacuAI'),
    ],

];
