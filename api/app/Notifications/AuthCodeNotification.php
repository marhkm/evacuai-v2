<?php

namespace App\Notifications;

use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class AuthCodeNotification extends Notification
{
    public function __construct(public string $code, public string $purpose) {}

    /** @return list<string> */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $action = $this->purpose === 'reset' ? 'reset your password' : 'verify your email';

        return (new MailMessage)
            ->subject("EvacuAI code: {$this->code}")
            ->line("Enter this code in the EvacuAI app to {$action}:")
            ->line("**{$this->code}**")
            ->line('It expires in 15 minutes. If you did not request it, ignore this email.');
    }
}
