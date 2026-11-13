<x-filament-panels::page>
    <div class="space-y-4">
        <p>
            When a student sends an SOS and has no class at that time, the app uses the phone's GPS to tell officers which
            <strong>building</strong> they are in (not the floor or room). For that, each building needs its corners.
        </p>
        <p>
            In Google Maps (Satellite view), right-click each corner of the building's roof and click the coordinates to
            copy them. Paste one corner per line, going around the building in order (3 to 8 corners). Leave a box empty
            to turn GPS off for that building.
        </p>

        <form wire:submit="save" class="space-y-4">
            @foreach ($names as $id => $name)
                <label style="display:block">
                    <span style="display:block;font-weight:600;margin-bottom:4px">{{ $name }} — GPS corners, one <code>lat, lng</code> per line</span>
                    <textarea wire:model="corners.{{ $id }}" rows="5" aria-label="{{ $name }} GPS corners" placeholder="10.32741, 123.95012"
                        style="width:100%;max-width:420px;padding:6px 8px;border:1px solid #d1d5db;border-radius:8px;font-family:monospace"></textarea>
                </label>
                @error("corners.$id") <p style="color:#c0392b">{{ $message }}</p> @enderror
            @endforeach
            <x-filament::button type="submit" icon="heroicon-o-check" wire:loading.attr="disabled">Save</x-filament::button>
        </form>
    </div>
</x-filament-panels::page>
