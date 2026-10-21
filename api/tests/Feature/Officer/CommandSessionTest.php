<?php

use App\Enums\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Laravel\Sanctum\Http\Middleware\EnsureFrontendRequestsAreStateful;

uses(RefreshDatabase::class);

function officerWithPassword(Role $role = Role::SafetyOfficer, bool $active = true): User
{
    $u = officerUser($role, $active);
    $u->forceFill(['password' => 'correct-horse-battery'])->save();

    return $u;
}

/** The Command Center is a same-origin SPA: the session cookie authenticates its API calls. */
function asSpa($test)
{
    return $test->withHeaders(['Referer' => 'http://localhost:8000/command', 'Origin' => 'http://localhost:8000']);
}

it('signs officers in with a session that reaches the officer API', function () {
    $officer = officerWithPassword();

    asSpa($this)->postJson('/command/session', ['email' => $officer->email, 'password' => 'correct-horse-battery'])->assertNoContent();
    app('auth')->forgetGuards(); // the next request must authenticate from the session cookie, not the in-memory guard
    asSpa($this)->getJson('/api/officer/me')->assertOk()->assertJson(['id' => $officer->id, 'role' => 'safety_officer']);
    asSpa($this)->getJson('/api/officer/overview')->assertOk();
    expect(DB::table('user_activity_logs')->where(['activity_type' => 'login', 'user_id' => $officer->id])->value('details'))
        ->toContain('command');
});

// Sanctum's stateful check, tested directly: feature tests share one in-memory session, so they cannot show it.
it('treats only requests from the app itself as stateful, on localhost or the LAN address', function () {
    $from = fn (string $url, array $headers) => EnsureFrontendRequestsAreStateful::fromFrontend(Request::create($url, 'GET', [], [], [], $headers));

    expect($from('http://localhost:8000/api/officer/me', ['HTTP_REFERER' => 'http://localhost:8000/command']))->toBeTrue()
        ->and($from('http://192.168.1.50:8000/api/officer/me', ['HTTP_REFERER' => 'http://192.168.1.50:8000/command']))->toBeTrue()
        ->and($from('http://localhost:8000/api/officer/me', []))->toBeFalse()
        ->and($from('http://localhost:8000/api/officer/me', ['HTTP_REFERER' => 'http://evil.example/command']))->toBeFalse();
});

it('refuses students and wrong passwords with one generic message', function () {
    $student = officerWithPassword(Role::Student);
    $officer = officerWithPassword();
    $inactive = officerWithPassword(Role::SafetyOfficer, false);
    $message = "Those details don't match an officer account.";

    foreach ([[$student->email, 'correct-horse-battery'], [$officer->email, 'wrong'], [$inactive->email, 'correct-horse-battery']] as [$email, $password]) {
        asSpa($this)->postJson('/command/session', ['email' => $email, 'password' => $password])
            ->assertUnprocessable()->assertJsonPath('errors.email.0', $message);
    }
    asSpa($this)->getJson('/api/officer/me')->assertUnauthorized();
});

it('throttles repeated attempts', function () {
    $officer = officerWithPassword();
    foreach (range(1, 5) as $i) {
        asSpa($this)->postJson('/command/session', ['email' => $officer->email, 'password' => 'wrong'])->assertUnprocessable();
    }
    asSpa($this)->postJson('/command/session', ['email' => $officer->email, 'password' => 'correct-horse-battery'])->assertStatus(429);
});

it('signs out', function () {
    $officer = officerWithPassword();
    asSpa($this)->postJson('/command/session', ['email' => $officer->email, 'password' => 'correct-horse-battery'])->assertNoContent();

    asSpa($this)->deleteJson('/command/session')->assertNoContent();
    app('auth')->forgetGuards();
    asSpa($this)->getJson('/api/officer/me')->assertUnauthorized();
});

it('serves the single-page app for deep links, with a content security policy', function () {
    $index = public_path('command/index.html');
    $existed = File::exists($index);
    if (! $existed) {
        File::ensureDirectoryExists(dirname($index));
        File::put($index, '<!doctype html><title>EvacuAI Command</title><div id="root"></div>');
    }
    try {
        $res = $this->get('/command/sos/5')->assertOk()->assertSee('<div id="root">', false);
        expect($res->headers->get('Content-Security-Policy'))->toContain("default-src 'self'")->toContain('connect-src');
    } finally {
        if (! $existed) {
            File::deleteDirectory(dirname($index));
        }
    }
});
