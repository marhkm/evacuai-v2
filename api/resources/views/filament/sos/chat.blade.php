@php($sos = $this->sos())
<x-filament-panels::page>
    <div wire:poll.3s class="space-y-4">
        <x-filament::section>
            <dl style="display:grid;grid-template-columns:max-content 1fr;gap:.35rem 1rem">
                <dt style="font-weight:600">Status</dt>
                <dd><x-filament::badge :color="\App\Filament\Resources\SosAlerts\SosAlertResource::statusColor($sos->status)" style="display:inline-flex">{{ $sos->status }}</x-filament::badge></dd>
                <dt style="font-weight:600">Location</dt><dd>{{ $this->place() ?? 'Unknown (not shared)' }}</dd>
                <dt style="font-weight:600">Phone</dt><dd>{{ $sos->user->phone ?? '—' }}</dd>
                <dt style="font-weight:600">Sent</dt><dd>{{ $sos->created_at->timezone(config('evacuai.timezone'))->format('M j, g:i:s A') }} ({{ $sos->created_at->diffForHumans() }})</dd>
                @if ($sos->message)
                    <dt style="font-weight:600">Message</dt><dd>{{ $sos->message }}</dd>
                @endif
                @if ($sos->responder)
                    <dt style="font-weight:600">Officer</dt><dd>{{ $sos->responder->name }}</dd>
                @endif
            </dl>
        </x-filament::section>

        <x-filament::section heading="Chat">
            <div class="space-y-2">
                @forelse ($sos->messages()->with('sender')->get() as $m)
                    <div @style(['text-align:right' => $m->sender_id !== $sos->user_id])>
                        <span style="font-size:.8rem;opacity:.7">{{ $m->sender->name }} · {{ $m->created_at->timezone(config('evacuai.timezone'))->format('g:i A') }}</span>
                        <p>{{ $m->body }}</p>
                    </div>
                @empty
                    <p style="opacity:.7">No messages yet.</p>
                @endforelse
            </div>
        </x-filament::section>
    </div>

    @if ($sos->isOpen())
        <form wire:submit="send" class="space-y-2">
            <x-filament::input.wrapper>
                <x-filament::input type="text" wire:model="body" placeholder="Reply to {{ $sos->user->name }}" maxlength="500" />
            </x-filament::input.wrapper>
            @error('body') <p style="color:#c0392b">{{ $message }}</p> @enderror
            <x-filament::button type="submit" icon="heroicon-o-paper-airplane">Send</x-filament::button>
        </form>
    @endif
</x-filament-panels::page>
