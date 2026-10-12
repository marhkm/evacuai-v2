<?php

namespace App\Filament\Pages;

use BackedEnum;
use chillerlan\QRCode\QRCode;
use chillerlan\QRCode\QROptions;
use Filament\Pages\Page;
use Filament\Support\Icons\Heroicon;
use Illuminate\Support\Facades\DB;
use Livewire\Attributes\Url;

/**
 * Printable QR sticker sheet (browser Print → Save as PDF). One sticker per node with a qr_id:
 * rooms, stair landings, exits and assembly points. Scanning sets the user's exact location in the app.
 */
class QrStickers extends Page
{
    protected string $view = 'filament.pages.qr-stickers';

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedQrCode;

    protected static ?string $title = 'QR stickers';

    #[Url]
    public ?string $building = null;

    public static function payload(string $qrId): string
    {
        return "evacuai://q/{$qrId}";
    }

    /** @return array<string, string> */
    public function buildingOptions(): array
    {
        return DB::table('buildings')->orderBy('id')->pluck('name', 'id')->all();
    }

    /** @return list<array{qr: string, label: string, image: string}> */
    public function stickers(): array
    {
        $buildings = DB::table('buildings')->pluck('name', 'id');
        $floors = DB::table('floors')->get()->keyBy(fn ($f) => "{$f->building_id}/{$f->level}");
        $rooms = DB::table('rooms')->pluck('name', 'id');
        $qr = new QRCode(new QROptions(['eccLevel' => QRCode::ECC_M, 'scale' => 6]));

        return DB::table('evac_nodes')
            ->whereNotNull('qr_id')
            ->when($this->building, fn ($q) => $q->where('building_id', $this->building))
            ->orderBy('building_id')->orderBy('level')->orderBy('id')
            ->get()
            ->map(fn ($n) => [
                'qr' => $n->qr_id,
                'label' => implode(' · ', [
                    $buildings[$n->building_id] ?? $n->building_id,
                    $floors["{$n->building_id}/{$n->level}"]->name ?? "Level {$n->level}",
                    $n->name ?? ($n->room_id ? $rooms[$n->room_id] ?? null : null) ?? self::humanize($n->id),
                ]),
                'image' => $qr->render(self::payload($n->qr_id)), // data:image/svg+xml;base64,...
            ])
            ->all();
    }

    // Same rule as displayName() in packages/campus-view.
    private static function humanize(string $id): string
    {
        $local = last(explode('/', $id));

        return str_replace('_', ' ', preg_replace('/_(G|\d+|Ground|Second|Third)$/', '', $local));
    }
}
