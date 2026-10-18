<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** Floor drawing traced from the official evacuation poster (walls, doors, stairs, labels, arrows), in metres. */
    public function up(): void
    {
        Schema::table('floors', fn (Blueprint $table) => $table->json('plan')->nullable());
    }

    public function down(): void
    {
        Schema::table('floors', fn (Blueprint $table) => $table->dropColumn('plan'));
    }
};
