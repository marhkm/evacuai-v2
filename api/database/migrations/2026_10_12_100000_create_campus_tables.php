<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Mirrors the CampusSnapshot contract (packages/routing/src/types.ts). IDs are global strings: <building>/<level>/<local>.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('buildings', function (Blueprint $table) {
            $table->string('id', 20)->primary();
            $table->string('name');
            $table->decimal('origin_lat', 10, 7)->nullable();
            $table->decimal('origin_lng', 10, 7)->nullable();
            $table->decimal('rotation_deg', 6, 2)->default(0);
            $table->json('footprint');
            $table->timestamps();
        });

        Schema::create('floors', function (Blueprint $table) {
            $table->id();
            $table->string('building_id', 20);
            $table->foreign('building_id')->references('id')->on('buildings')->cascadeOnDelete();
            $table->integer('level');
            $table->string('name', 50);
            $table->decimal('elevation_m', 6, 2);
            $table->decimal('height_m', 5, 2)->default(3.5);
            $table->string('floor_plan_url')->nullable();
            $table->unique(['building_id', 'level']);
        });

        Schema::create('rooms', function (Blueprint $table) {
            $table->string('id', 120)->primary();
            $table->string('building_id', 20);
            $table->foreign('building_id')->references('id')->on('buildings')->cascadeOnDelete();
            $table->integer('level');
            $table->string('name', 100);
            $table->string('type', 30);
            $table->json('polygon');
        });

        Schema::create('evac_nodes', function (Blueprint $table) {
            $table->string('id', 120)->primary();
            $table->string('building_id', 20);
            $table->foreign('building_id')->references('id')->on('buildings')->cascadeOnDelete();
            $table->integer('level');
            $table->enum('type', ['room', 'hallway', 'stairwell', 'exit', 'assembly_point', 'elevator']);
            $table->decimal('x', 9, 3);
            $table->decimal('y', 9, 3);
            $table->string('name', 100)->nullable();
            $table->string('room_id', 120)->nullable();
            $table->foreign('room_id')->references('id')->on('rooms')->nullOnDelete();
            $table->json('safe_for');
            $table->string('qr_id', 60)->nullable()->unique();
            $table->unsignedInteger('capacity')->nullable();
            $table->unsignedInteger('occupancy')->default(0);
        });

        Schema::create('evac_edges', function (Blueprint $table) {
            $table->string('id', 250)->primary(); // "<from>-><to>"
            $table->string('from_node_id', 120);
            $table->string('to_node_id', 120);
            $table->foreign('from_node_id')->references('id')->on('evac_nodes')->cascadeOnDelete();
            $table->foreign('to_node_id')->references('id')->on('evac_nodes')->cascadeOnDelete();
            $table->enum('type', ['corridor', 'stairs', 'ramp', 'door', 'outdoor', 'elevator']);
            $table->decimal('distance_m', 8, 2);
            $table->boolean('bidirectional')->default(true);
            $table->json('flags');
            $table->enum('status', ['open', 'blocked', 'congested'])->default('open');
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('assembly_points', function (Blueprint $table) {
            $table->string('id', 60)->primary();
            $table->string('node_id', 120);
            $table->foreign('node_id')->references('id')->on('evac_nodes')->cascadeOnDelete();
            $table->decimal('lat', 10, 7)->nullable();
            $table->decimal('lng', 10, 7)->nullable();
            $table->unsignedInteger('radius_m')->default(25);
        });
    }

    public function down(): void
    {
        foreach (['assembly_points', 'evac_edges', 'evac_nodes', 'rooms', 'floors', 'buildings'] as $t) {
            Schema::dropIfExists($t);
        }
    }
};
