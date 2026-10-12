<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Imports campus-data/<dataset>.snapshot.json (CampusSnapshot, see packages/routing/src/types.ts).
 * Safe to re-run on every deploy: geometry is upserted, live edge status and node occupancy are kept.
 */
class CampusSeeder extends Seeder
{
    public function run(): void
    {
        $path = config('evacuai.campus_data_path').'/'.config('evacuai.campus_dataset').'.snapshot.json';
        $snap = json_decode((string) @file_get_contents($path), true);
        if (! is_array($snap)) {
            throw new RuntimeException("Campus snapshot missing or invalid: {$path}");
        }

        DB::transaction(function () use ($snap) {
            $now = now();
            foreach ($snap['buildings'] as $b) {
                DB::table('buildings')->upsert([[
                    'id' => $b['id'],
                    'name' => $b['name'],
                    'origin_lat' => $b['origin']['lat'] ?? null,
                    'origin_lng' => $b['origin']['lng'] ?? null,
                    'rotation_deg' => $b['rotation_deg'],
                    'footprint' => json_encode($b['footprint']),
                    'created_at' => $now,
                    'updated_at' => $now,
                ]], ['id'], ['name', 'origin_lat', 'origin_lng', 'rotation_deg', 'footprint', 'updated_at']);

                DB::table('floors')->upsert(array_map(fn ($f) => [
                    'building_id' => $b['id'],
                    'level' => $f['level'],
                    'name' => $f['name'],
                    'elevation_m' => $f['elevation_m'],
                    'height_m' => $f['height_m'],
                ], $b['floors']), ['building_id', 'level'], ['name', 'elevation_m', 'height_m']);
            }

            DB::table('rooms')->upsert(array_map(fn ($r) => [
                'id' => $r['id'],
                'building_id' => $r['building'],
                'level' => $r['level'],
                'name' => $r['name'],
                'type' => $r['type'],
                'polygon' => json_encode($r['polygon']),
            ], $snap['rooms']), ['id'], ['building_id', 'level', 'name', 'type', 'polygon']);

            DB::table('evac_nodes')->upsert(array_map(fn ($n) => [
                'id' => $n['id'],
                'building_id' => $n['building'],
                'level' => $n['level'],
                'type' => $n['type'],
                'x' => $n['x'],
                'y' => $n['y'],
                'name' => $n['name'] ?? null,
                'room_id' => $n['room_id'] ?? null,
                'safe_for' => json_encode($n['safe_for']),
                'qr_id' => $n['qr_id'] ?? null,
                'capacity' => $n['capacity'] ?? null,
            ], $snap['nodes']), ['id'], ['building_id', 'level', 'type', 'x', 'y', 'name', 'room_id', 'safe_for', 'qr_id', 'capacity']);

            foreach (array_chunk($snap['edges'], 500) as $chunk) {
                DB::table('evac_edges')->upsert(array_map(fn ($e) => [
                    'id' => $e['id'],
                    'from_node_id' => $e['from'],
                    'to_node_id' => $e['to'],
                    'type' => $e['type'],
                    'distance_m' => $e['distance_m'],
                    'bidirectional' => $e['bidirectional'],
                    'flags' => json_encode($e['flags']),
                    'created_at' => $now,
                    'updated_at' => $now,
                ], $chunk), ['id'], ['from_node_id', 'to_node_id', 'type', 'distance_m', 'bidirectional', 'flags', 'updated_at']);
            }

            DB::table('assembly_points')->upsert(array_map(fn ($a) => [
                'id' => $a['id'],
                'node_id' => $a['node_id'],
                'lat' => $a['lat'],
                'lng' => $a['lng'],
                'radius_m' => $a['radius_m'],
            ], $snap['assemblyPoints']), ['id'], ['node_id', 'lat', 'lng', 'radius_m']);
        });
    }
}
