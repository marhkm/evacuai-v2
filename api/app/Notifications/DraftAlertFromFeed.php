<?php

namespace App\Notifications;

use App\Filament\Resources\Alerts\AlertResource;
use Filament\Actions\Action;
use Filament\Notifications\Notification as FilamentNotification;
use Illuminate\Notifications\Notification;

/** Bell notification: a feed created draft alerts that need an officer's decision. */
class DraftAlertFromFeed extends Notification
{
    public function __construct(public int $count) {}

    /** @return list<string> */
    public function via(object $notifiable): array
    {
        return ['database'];
    }

    /** @return array<string, mixed> */
    public function toDatabase(object $notifiable): array
    {
        return FilamentNotification::make()
            ->title($this->count === 1 ? 'New draft alert from a hazard feed' : "{$this->count} new draft alerts from hazard feeds")
            ->body('Review it, then publish or discard. Drafts are not sent to anyone.')
            ->warning()
            ->actions([Action::make('review')->label('Review drafts')->url(AlertResource::getUrl('index', ['filters' => ['status' => ['value' => 'draft']]]))])
            ->getDatabaseMessage();
    }
}
