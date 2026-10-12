<x-filament-panels::page>
    @if ($options = $this->alertOptions())
        <label style="display:flex;gap:.5rem;align-items:center">
            <span style="font-weight:600">Alert</span>
            <x-filament::input.wrapper>
                <x-filament::input.select wire:model.live="alert">
                    <option value="">Current active alert</option>
                    @foreach ($options as $id => $label)
                        <option value="{{ $id }}">{{ $label }}</option>
                    @endforeach
                </x-filament::input.select>
            </x-filament::input.wrapper>
        </label>
    @endif

    @if (! $this->alertId())
        <x-filament::section>No active alert. Everyone shows as Unknown until an alert is broadcast and people check in.</x-filament::section>
    @endif

    <div wire:poll.5s style="display:grid;grid-template-columns:repeat(auto-fit,minmax(9rem,1fr));gap:1rem">
        @php($c = $this->counts())
        @foreach ([['Safe', $c['safe'], '#16a34a'], ['Needs help', $c['needs_help'], '#dc2626'], ['Unknown', $c['unknown'], '#d97706'], ['Open SOS', $c['sos'], '#dc2626'], ['People', $c['total'], 'inherit']] as [$label, $value, $color])
            <x-filament::section>
                <div style="font-size:.85rem;opacity:.75">{{ $label }}</div>
                <div style="font-size:1.8rem;font-weight:700;color:{{ $color }}">{{ $value }}</div>
            </x-filament::section>
        @endforeach
        @foreach ($this->occupancy() as $ap)
            <x-filament::section>
                <div style="font-size:.85rem;opacity:.75">{{ $ap['name'] }}</div>
                <div style="font-size:1.8rem;font-weight:700">{{ $ap['count'] }} <span style="font-size:.9rem;font-weight:400">checked in</span></div>
            </x-filament::section>
        @endforeach
    </div>

    {{ $this->table }}
</x-filament-panels::page>
