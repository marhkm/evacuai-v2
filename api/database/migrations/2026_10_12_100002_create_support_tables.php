<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('social_accounts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('provider', 20);
            $table->string('provider_id');
            $table->timestamps();
            $table->unique(['provider', 'provider_id']);
        });

        Schema::create('device_tokens', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('token')->unique(); // Expo push token
            $table->string('platform', 10);
            $table->timestamp('last_seen_at')->nullable();
            $table->timestamps();
        });

        Schema::create('schedules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('subject', 100);
            $table->string('room_id', 120);
            $table->foreign('room_id')->references('id')->on('rooms')->cascadeOnDelete();
            $table->string('days', 10); // prototype codes: M, T, W, TH, F, S, MWF, TTH, ...
            $table->time('time_start');
            $table->time('time_end');
            $table->index('user_id');
        });

        Schema::create('feedback', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->unsignedTinyInteger('rating');
            $table->text('comments')->nullable();
            $table->timestamps();
        });
        DB::statement('ALTER TABLE feedback ADD CONSTRAINT feedback_rating_range CHECK (rating BETWEEN 1 AND 5)');

        Schema::create('user_activity_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('activity_type', 50);
            $table->json('details')->nullable();
            $table->string('ip_address', 45)->nullable(); // purged after retention period (RA 10173)
            $table->string('device_info', 200)->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->index(['activity_type', 'created_at']);
        });

        Schema::create('system_configurations', function (Blueprint $table) {
            $table->string('key', 60)->primary();
            $table->json('value');
            $table->string('description', 200)->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        foreach (['system_configurations', 'user_activity_logs', 'feedback', 'schedules', 'device_tokens', 'social_accounts'] as $t) {
            Schema::dropIfExists($t);
        }
    }
};
