<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** Per officer and SOS, the last chat message the officer has seen (for "New · n" and the SOS badge). */
    public function up(): void
    {
        Schema::create('sos_seen', function (Blueprint $table) {
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('sos_alert_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('message_id');
            $table->primary(['user_id', 'sos_alert_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sos_seen');
    }
};
