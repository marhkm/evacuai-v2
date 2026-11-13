<x-filament-panels::page>
    <div class="space-y-4">
        <p>
            During an officer's active alert, a hazard report becomes <strong>Verified</strong> by itself (it then shows on
            the maps and changes evacuation routes) when enough <strong>different students</strong> who were last seen on
            that floor send <strong>different photos</strong> of the same hazard within the time below, and the server's AI
            says yes to at least two photos. Re-sent photos and students marked "Often false" do not count. Safety officers
            can always verify or reject; rejecting one auto-verified report clears its whole group.
        </p>

        <form wire:submit="save" class="space-y-3">
            <label style="display:flex;gap:12px;align-items:center">
                <span style="min-width:220px;font-weight:600">Different students needed</span>
                <input type="number" min="2" max="10" wire:model="threshold" aria-label="Different students needed"
                    style="width:120px;padding:6px 8px;border:1px solid #d1d5db;border-radius:8px">
            </label>
            @error('threshold') <p style="color:#c0392b">{{ $message }}</p> @enderror
            <label style="display:flex;gap:12px;align-items:center">
                <span style="min-width:220px;font-weight:600">Within (minutes)</span>
                <input type="number" min="5" max="60" wire:model="minutes" aria-label="Within how many minutes"
                    style="width:120px;padding:6px 8px;border:1px solid #d1d5db;border-radius:8px">
            </label>
            @error('minutes') <p style="color:#c0392b">{{ $message }}</p> @enderror
            <x-filament::button type="submit" icon="heroicon-o-check" wire:loading.attr="disabled">Save</x-filament::button>
        </form>
    </div>
</x-filament-panels::page>
