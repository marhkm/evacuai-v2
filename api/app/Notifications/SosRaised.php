<?php

namespace App\Notifications;

use App\Models\SosAlert;
use App\Support\Places;
use Filament\Actions\Action;
use Filament\Notifications\Notification as FilamentNotification;
use Illuminate\Notifications\Notification;

/** Bell notification in the admin panel for every new SOS; opens it in the Command Center. */
class SosRaised extends Notification
{
    public function __construct(public SosAlert $sos) {}

    /** @return list<string> */
    public function via(object $notifiable): array
    {
        return ['database'];
    }

    /** @return array<string, mixed> */
    public function toDatabase(object $notifiable): array
    {
        $where = Places::label($this->sos->building_id, $this->sos->level, $this->sos->node_id) ?? 'unknown location';

        return FilamentNotification::make()
            ->title('SOS: someone needs help')
            ->body("{$this->sos->user->name} at {$where}.")
            ->danger()
            ->actions([Action::make('open')->label('Open chat')->url(url("/command/sos/{$this->sos->id}"))])
            ->getDatabaseMessage();
    }
}
