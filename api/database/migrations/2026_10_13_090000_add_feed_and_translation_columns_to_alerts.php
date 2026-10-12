<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('alerts', function (Blueprint $table) {
            $table->string('external_id', 120)->nullable()->unique(); // feed event id (e.g. usgs:us7000abcd), so polling never duplicates a draft
            $table->jsonb('translations')->nullable(); // {"ceb": "...", "fil": "..."}, reviewed by the officer before broadcast
        });
    }

    public function down(): void
    {
        Schema::table('alerts', function (Blueprint $table) {
            $table->dropColumn(['external_id', 'translations']);
        });
    }
};
