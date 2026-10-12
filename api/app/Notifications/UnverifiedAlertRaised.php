<?php

namespace App\Notifications;

use App\Models\Alert;
use Filament\Notifications\Notification as FilamentNotification;
use Illuminate\Notifications\Notification;

/** Bell notification in the admin panel when reports auto-broadcast an unverified alert. */
class UnverifiedAlertRaised extends Notification
{
    public function __construct(public Alert $alert) {}

    /** @return list<string> */
    public function via(object $notifiable): array
    {
        return ['database'];
    }

    /** @return array<string, mixed> */
    public function toDatabase(object $notifiable): array
    {
        return FilamentNotification::make()
            ->title('Unverified alert broadcast')
            ->body($this->alert->message.' Confirm or retract it now.')
            ->danger()
            ->getDatabaseMessage();
    }
}
