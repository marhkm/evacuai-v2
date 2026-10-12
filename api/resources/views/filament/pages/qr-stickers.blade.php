<x-filament-panels::page>
    <style>
        .qr-sheet { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
        .qr-sticker { border: 1px dashed #999; border-radius: 8px; padding: 10px; text-align: center; background: #fff; color: #111; break-inside: avoid; }
        .qr-sticker img { width: 100%; max-width: 160px; margin: 0 auto; }
        .qr-label { font-size: 13px; font-weight: 600; margin-top: 6px; }
        .qr-code { font-family: monospace; font-size: 12px; color: #444; }
        .qr-tools { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
        @media print {
            .fi-sidebar, .fi-topbar, .fi-header, .qr-tools { display: none !important; }
            .fi-main { padding: 0 !important; }
            .qr-sheet { grid-template-columns: repeat(4, 1fr); }
        }
    </style>

    <div class="qr-tools">
        <label>
            Building
            <select wire:model.live="building">
                <option value="">All buildings</option>
                @foreach ($this->buildingOptions() as $id => $name)
                    <option value="{{ $id }}">{{ $name }}</option>
                @endforeach
            </select>
        </label>
        <x-filament::button type="button" onclick="window.print()" icon="heroicon-o-printer">Print / Save as PDF</x-filament::button>
    </div>

    @php($stickers = $this->stickers())
    <p>{{ count($stickers) }} stickers. Place them inside every room door, on each stairwell landing, at exits and at assembly points.</p>

    <div class="qr-sheet">
        @foreach ($stickers as $s)
            <div class="qr-sticker">
                <img src="{{ $s['image'] }}" alt="QR code {{ $s['qr'] }}">
                <div class="qr-label">{{ $s['label'] }}</div>
                <div class="qr-code">EvacuAI · {{ $s['qr'] }}</div>
            </div>
        @endforeach
    </div>
</x-filament-panels::page>
