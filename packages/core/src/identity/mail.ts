/**
 * Mail boundary. Resend implements this in the app layer; tests and local
 * dev use the console sender. Identity never imports an email vendor.
 */
export interface MailSender {
  send(message: { to: string; subject: string; text: string }): Promise<void>;
}

export class ConsoleMailSender implements MailSender {
  async send(message: {
    to: string;
    subject: string;
    text: string;
  }): Promise<void> {
    console.log(`[mail → ${message.to}] ${message.subject}\n${message.text}`);
  }
}
