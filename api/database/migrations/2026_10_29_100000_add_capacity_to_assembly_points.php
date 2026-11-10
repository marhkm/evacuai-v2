<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** How many people a safe zone holds, set by an admin (the campus seeder never touches it). Null: no limit shown. */
    public function up(): void
    {
        Schema::table('assembly_points', function (Blueprint $table) {
            $table->unsignedInteger('capacity')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('assembly_points', function (Blueprint $table) {
            $table->dropColumn('capacity');
        });
    }
};
