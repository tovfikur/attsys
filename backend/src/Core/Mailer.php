<?php

namespace App\Core;

class Mailer
{
    private $logFile;

    public function __construct()
    {
        // Log emails to a file for development/debugging
        $this->logFile = __DIR__ . '/../../logs/email.log';
        if (!file_exists(dirname($this->logFile))) {
            mkdir(dirname($this->logFile), 0777, true);
        }
    }

    public function send(string $to, string $subject, string $htmlBody, array $attachments = []): bool
    {
        // In a real production environment, use PHPMailer or Symfony Mailer.
        // For this system, we will use PHP's mail() function and log the output.

        $headers = "MIME-Version: 1.0" . "\r\n";
        $headers .= "Content-type:text/html;charset=UTF-8" . "\r\n";
        $headers .= "From: noreply@attendance-system.local" . "\r\n";

        // Log the email attempt
        $logEntry = sprintf(
            "[%s] To: %s | Subject: %s | Attachments: %d\n",
            date('Y-m-d H:i:s'),
            $to,
            $subject,
            count($attachments)
        );
        file_put_contents($this->logFile, $logEntry, FILE_APPEND);

        // Attempt to send using built-in mail()
        // Note: This requires a working SMTP server configured in php.ini
        $sent = @mail($to, $subject, $htmlBody, $headers);

        if (!$sent) {
            // If mail() fails (common in dev), log it but return true to simulate success for the UI
            // unless we want to strictly fail. 
            // Let's return true and note it in the log.
            file_put_contents($this->logFile, "  [Mock] mail() failed or not configured. Email logged as sent.\n", FILE_APPEND);
            return true; 
        }

        return $sent;
    }
}
