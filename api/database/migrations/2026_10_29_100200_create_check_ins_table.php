<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** Every check-in, never updated (evacuation_logs keeps the current status per alert). */
    public function up(): void
    {
        Schema::create('check_ins', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('alert_id')->constrained()->cascadeOnDelete();
            $table->string('assembly_node_id', 120)->nullable(); // null: safe, not at a safe zone
            $table->foreign('assembly_node_id')->references('id')->on('evac_nodes')->nullOnDelete();
            $table->string('source', 10); // qr | list | gps | none
            $table->timestamp('created_at')->useCurrent();
            $table->index(['user_id', 'alert_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('check_ins');
    }
};
