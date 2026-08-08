import { ConsoleMailSender, type MailSender } from "@factory/core/identity";
import { env } from "./env";

/**
 * Resend over plain fetch (no SDK dep — one endpoint, one shape).
 * Implements the chassis MailSender boundary; identity never sees the
 * vendor. Falls back to ConsoleMailSender when RESEND_API_KEY is absent.
 */
class ResendMailSender implements MailSender {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(message: {
    to: string;
    subject: string;
    text: string;
  }): Promise<void> {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
      }),
    });
    if (!res.ok) {
      throw new Error(
        `Resend send failed (${res.status}): ${(await res.text()).slice(0, 300)}`,
      );
    }
  }
}

export function getMailSender(): MailSender {
  const key = env.RESEND_API_KEY;
  return key
    ? new ResendMailSender(key, env.MAIL_FROM)
    : new ConsoleMailSender();
}
