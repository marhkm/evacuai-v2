<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Each building's outline as GPS corners ([[lat, lng], ...]), entered by an admin: lets an SOS name the building from
// the phone's GPS when the student has no class. The campus seeder never overwrites it.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('buildings', function (Blueprint $table) {
            $table->json('gps_corners')->nullable()->after('footprint');
        });
    }

    public function down(): void
    {
        Schema::table('buildings', function (Blueprint $table) {
            $table->dropColumn('gps_corners');
        });
    }
};
