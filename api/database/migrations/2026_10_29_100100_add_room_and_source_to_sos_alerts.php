<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** A picked room without a map point, and where the place came from (a "schedule" place asks the student to confirm). */
    public function up(): void
    {
        Schema::table('sos_alerts', function (Blueprint $table) {
            $table->string('room_id', 120)->nullable()->after('node_id');
            $table->foreign('room_id')->references('id')->on('rooms')->nullOnDelete();
            $table->string('location_source', 20)->nullable()->after('room_id'); // qr | manual | schedule
        });
    }

    public function down(): void
    {
        Schema::table('sos_alerts', function (Blueprint $table) {
            $table->dropForeign(['room_id']);
            $table->dropColumn(['room_id', 'location_source']);
        });
    }
};
