<x-filament-panels::page>
    <div class="space-y-4">
        <p>
            Upload a CSV exported from the registrar with the columns
            <code>email, subject, room_code, days, time_start, time_end</code>
            (for example <code>juan@uclm.edu.ph, IT 101, BE203, MWF, 08:00, 09:30</code>).
            Each listed student's previous schedule is replaced.
        </p>

        <form wire:submit="import" class="space-y-3">
            <input type="file" wire:model="file" accept=".csv,text/csv">
            @error('file') <p style="color:#c0392b">{{ $message }}</p> @enderror
            <x-filament::button type="submit" icon="heroicon-o-arrow-up-tray" wire:loading.attr="disabled">Import</x-filament::button>
        </form>

        @if ($summary)
            <p style="font-weight:600">{{ $summary }}</p>
        @endif
        @if ($problems)
            <ul style="color:#c0392b">
                @foreach ($problems as $p)
                    <li>{{ $p }}</li>
                @endforeach
            </ul>
        @endif
    </div>
</x-filament-panels::page>
