<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** Signals for checking a report (fresh photo, duplicates, where the reporter was, local AI) and false reports. */
    public function up(): void
    {
        Schema::table('hazard_reports', function (Blueprint $table) {
            $table->timestamp('photo_taken_at')->nullable();
            $table->char('photo_hash', 16)->nullable()->index(); // 64-bit dHash, hex
            $table->foreignId('duplicate_of')->nullable()->constrained('hazard_reports')->nullOnDelete();
            $table->string('reporter_place', 10)->nullable(); // match | elsewhere | unknown
            $table->string('reporter_place_label')->nullable();
            $table->string('ai_verdict', 12)->nullable(); // match | no_match | unclear | unavailable
            $table->string('ai_note', 200)->nullable();
            $table->boolean('auto_verified')->default(false);
            $table->string('dismiss_reason', 10)->nullable(); // false | other
        });
        Schema::table('users', function (Blueprint $table) {
            $table->timestamp('false_reports_cleared_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('hazard_reports', function (Blueprint $table) {
            $table->dropConstrainedForeignId('duplicate_of');
            $table->dropColumn(['photo_taken_at', 'photo_hash', 'reporter_place', 'reporter_place_label', 'ai_verdict', 'ai_note', 'auto_verified', 'dismiss_reason']);
        });
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('false_reports_cleared_at');
        });
    }
};
