<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $hazards = ['earthquake', 'fire', 'flood', 'structural_damage', 'other'];

        Schema::create('alerts', function (Blueprint $table) use ($hazards) {
            $table->id();
            $table->string('building_id', 20)->nullable(); // null = campus-wide
            $table->foreign('building_id')->references('id')->on('buildings')->nullOnDelete();
            $table->foreignId('issued_by')->nullable()->constrained('users')->nullOnDelete();
            $table->enum('hazard_type', $hazards);
            $table->enum('severity_level', ['low', 'medium', 'high', 'critical']);
            $table->text('message');
            $table->enum('status', ['draft', 'active', 'resolved', 'retracted'])->default('active');
            $table->enum('source', ['admin', 'reports', 'feed', 'official_advisory'])->default('admin');
            $table->boolean('verified')->default(true); // false = auto-broadcast from 3+ reports, awaiting admin
            $table->boolean('is_drill')->default(false);
            $table->timestamp('issued_at')->nullable();
            $table->timestamp('resolved_at')->nullable();
            $table->timestamps();
            $table->index(['status', 'issued_at']);
        });

        Schema::create('alert_notifications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('alert_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->enum('channel', ['push', 'sms']);
            $table->enum('delivery_status', ['pending', 'sent', 'failed'])->default('pending');
            $table->timestamp('sent_at')->nullable();
            $table->timestamp('read_at')->nullable();
            $table->unique(['alert_id', 'user_id', 'channel']);
        });

        Schema::create('hazard_reports', function (Blueprint $table) use ($hazards) {
            $table->id();
            $table->foreignId('reported_by')->constrained('users')->cascadeOnDelete();
            $table->string('building_id', 20);
            $table->foreign('building_id')->references('id')->on('buildings')->cascadeOnDelete();
            $table->integer('level');
            $table->string('room_id', 120)->nullable();
            $table->foreign('room_id')->references('id')->on('rooms')->nullOnDelete();
            $table->string('node_id', 120)->nullable();
            $table->foreign('node_id')->references('id')->on('evac_nodes')->nullOnDelete();
            $table->enum('hazard_type', $hazards);
            $table->text('description')->nullable();
            $table->string('photo_path')->nullable();
            $table->enum('status', ['pending', 'verified', 'resolved', 'dismissed'])->default('pending');
            $table->foreignId('verified_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('alert_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamp('resolved_at')->nullable();
            $table->timestamps();
            $table->index(['status', 'hazard_type', 'building_id', 'level', 'created_at']); // 3-report clustering
        });

        Schema::create('sos_alerts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('alert_id')->nullable()->constrained()->nullOnDelete();
            $table->string('node_id', 120)->nullable();
            $table->foreign('node_id')->references('id')->on('evac_nodes')->nullOnDelete();
            $table->string('building_id', 20)->nullable();
            $table->integer('level')->nullable();
            $table->text('message')->nullable();
            $table->enum('status', ['pending', 'acknowledged', 'resolved', 'cancelled'])->default('pending');
            $table->foreignId('acknowledged_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('acknowledged_at')->nullable();
            $table->timestamp('resolved_at')->nullable();
            $table->timestamps();
        });

        Schema::create('sos_messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sos_alert_id')->constrained()->cascadeOnDelete();
            $table->foreignId('sender_id')->constrained('users')->cascadeOnDelete();
            $table->text('body');
            $table->timestamp('created_at')->useCurrent();
        });

        Schema::create('evacuation_routes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('alert_id')->nullable()->constrained()->nullOnDelete();
            $table->string('origin_node_id', 120);
            $table->string('destination_node_id', 120);
            $table->json('path_nodes');
            $table->decimal('distance_m', 8, 2);
            $table->unsignedInteger('recalculated_count')->default(0);
            $table->timestamp('created_at')->useCurrent();
        });

        Schema::create('evacuation_logs', function (Blueprint $table) { // Check-in Safe
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('alert_id')->constrained()->cascadeOnDelete();
            $table->string('assembly_node_id', 120)->nullable();
            $table->foreign('assembly_node_id')->references('id')->on('evac_nodes')->nullOnDelete();
            $table->enum('status', ['safe', 'needs_help']);
            $table->timestamp('checked_in_at')->useCurrent();
            $table->unique(['user_id', 'alert_id']);
        });

        Schema::create('location_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('alert_id')->nullable()->constrained()->cascadeOnDelete();
            $table->string('node_id', 120)->nullable();
            $table->string('room_id', 120)->nullable();
            $table->string('building_id', 20)->nullable();
            $table->integer('level')->nullable();
            $table->enum('source', ['qr', 'manual', 'schedule', 'barometer', 'gps']);
            $table->enum('confidence', ['exact', 'likely', 'unknown']);
            $table->timestamp('created_at')->useCurrent();
            $table->index(['alert_id', 'user_id', 'created_at']);
        });
    }

    public function down(): void
    {
        foreach (['location_events', 'evacuation_logs', 'evacuation_routes', 'sos_messages', 'sos_alerts', 'hazard_reports', 'alert_notifications', 'alerts'] as $t) {
            Schema::dropIfExists($t);
        }
    }
};
