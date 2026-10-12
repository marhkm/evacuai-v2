<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Support\Activity;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;

class MeController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        return response()->json(['user' => new UserResource($request->user())]);
    }

    public function update(Request $request): JsonResponse
    {
        $user = $request->user();
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:100'],
            'department' => ['sometimes', 'nullable', 'string', 'max:100'],
            'phone' => ['sometimes', 'nullable', 'regex:/^(\+639\d{9}|09\d{9})$/', Rule::unique('users', 'phone')->ignore($user->id)],
        ], ['phone.regex' => 'Enter a valid Philippine mobile number (09XXXXXXXXX).']);
        $user->update($data);

        return $this->show($request);
    }

    public function consent(Request $request): JsonResponse
    {
        $user = $request->user();
        $user->forceFill(['consented_at' => $user->consented_at ?? now()])->save();

        return $this->show($request);
    }

    public function password(Request $request): JsonResponse
    {
        $user = $request->user();
        $data = $request->validate([
            'current_password' => [$user->password ? 'required' : 'nullable', 'string'],
            'password' => ['required', 'confirmed', Password::min(8)],
        ]);
        if ($user->password && ! Hash::check($data['current_password'], $user->password)) {
            throw ValidationException::withMessages(['current_password' => 'The current password is incorrect.']);
        }
        $user->forceFill(['password' => $data['password']])->save();
        $user->tokens()->where('id', '!=', $user->currentAccessToken()->id)->delete();

        return response()->json(['message' => 'Password updated.']);
    }

    public function destroy(Request $request): Response
    {
        $user = $request->user();
        if ($user->password) {
            $data = $request->validate(['password' => 'required|string']);
            if (! Hash::check($data['password'], $user->password)) {
                throw ValidationException::withMessages(['password' => 'The password is incorrect.']);
            }
        }
        $user->tokens()->delete();
        Activity::log('account_deleted', ['user_id' => $user->id], $user->id);
        $user->delete();

        return response()->noContent();
    }
}
