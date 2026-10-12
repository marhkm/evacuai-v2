<?php

namespace App\Filament\Resources\SosAlerts\Pages;

use App\Filament\Resources\SosAlerts\SosAlertResource;
use App\Models\SosAlert;
use App\Support\Places;
use Filament\Resources\Pages\Concerns\InteractsWithRecord;
use Filament\Resources\Pages\Page;
use Illuminate\Contracts\Support\Htmlable;

/** One SOS: who and where, status actions, and the two-way chat with the person (polled every 3 s). */
class SosChat extends Page
{
    use InteractsWithRecord;

    protected static string $resource = SosAlertResource::class;

    protected string $view = 'filament.sos.chat';

    public string $body = '';

    public function mount(int|string $record): void
    {
        $this->record = $this->resolveRecord($record);
    }

    public function getTitle(): string|Htmlable
    {
        return "SOS from {$this->sos()->user->name}";
    }

    public function sos(): SosAlert
    {
        /** @var SosAlert */
        return $this->getRecord();
    }

    public function place(): ?string
    {
        return Places::label($this->sos()->building_id, $this->sos()->level, $this->sos()->node_id);
    }

    public function send(): void
    {
        $this->validate(['body' => ['required', 'string', 'max:500']]);
        $sos = $this->sos();
        if (! $sos->isOpen()) {
            $this->addError('body', 'This SOS is closed.');

            return;
        }
        if ($sos->status === 'pending') {
            $sos->acknowledge(); // replying means an officer is on it
        }
        $sos->messages()->create(['sender_id' => auth()->id(), 'body' => trim($this->body)]);
        $this->body = '';
    }

    protected function getHeaderActions(): array
    {
        return [SosAlertResource::acknowledgeAction(), SosAlertResource::resolveAction()];
    }
}
