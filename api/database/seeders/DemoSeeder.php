<?php

namespace Database\Seeders;

use App\Enums\Role;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

/** Local/student testing accounts only (SEED_DEMO=true). Listed in docs/TESTING.md. Never run in production. */
class DemoSeeder extends Seeder
{
    public const PASSWORD = 'evacuai-demo';

    public function run(): void
    {
        if (app()->isProduction()) {
            return; // demo accounts must never exist in production
        }

        foreach (Role::cases() as $role) {
            $user = User::firstOrNew(['email' => "{$role->value}@evacuai.test"]);
            $user->forceFill([
                'name' => 'Demo '.str($role->value)->replace('_', ' ')->title(),
                // Rehashing on every boot would change the hash and sign officers out of the admin panel.
                'password' => $user->password && Hash::check(self::PASSWORD, $user->password) ? $user->password : self::PASSWORD,
                'role' => $role,
                'email_verified_at' => $user->email_verified_at ?? now(),
                'consented_at' => $user->consented_at ?? now(),
            ])->save();
        }

        $this->call(DemoDrillSeeder::class); // sample finished drill so the dashboards have data
    }
}
