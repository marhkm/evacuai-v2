<x-filament-panels::page>
    <div class="space-y-4">
        <p>
            How many people each safe zone can hold. Students see "42 of 300" when they check in, and the app suggests
            another zone when one is full. Leave a capacity blank to show only the head count.
        </p>

        <form wire:submit="save" class="space-y-3">
            @foreach ($this->zones() as $zone)
                <label style="display:flex;gap:12px;align-items:center">
                    <span style="min-width:220px;font-weight:600">{{ $zone['name'] }}</span>
                    <input type="number" min="0" step="1" wire:model="capacities.{{ $zone['id'] }}" aria-label="Capacity of {{ $zone['name'] }}"
                        placeholder="No limit" style="width:140px;padding:6px 8px;border:1px solid #d1d5db;border-radius:8px">
                    <span>people</span>
                </label>
                @error('capacities.'.$zone['id']) <p style="color:#c0392b">{{ $message }}</p> @enderror
            @endforeach
            <x-filament::button type="submit" icon="heroicon-o-check" wire:loading.attr="disabled">Save</x-filament::button>
        </form>
    </div>
</x-filament-panels::page>
