<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Registrar room code as printed on class schedules (e.g. "BE203"), used to import schedules.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('rooms', function (Blueprint $table) {
            $table->string('code', 40)->nullable()->unique();
        });
    }

    public function down(): void
    {
        Schema::table('rooms', fn (Blueprint $table) => $table->dropColumn('code'));
    }
};
