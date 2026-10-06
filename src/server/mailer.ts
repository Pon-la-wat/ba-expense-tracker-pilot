export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export type Mailer = (mail: Mail) => Promise<void>;

/** Posts the mail as JSON to MAIL_WEBHOOK_URL (any mail relay can sit behind it); without one it only logs. */
export function createMailer(webhookUrl: string | undefined): Mailer {
  if (!webhookUrl) {
    return async (mail) => {
      console.warn(`MAIL_WEBHOOK_URL is not set; mail to ${mail.to} was not sent:\n${mail.text}`);
    };
  }
  return async (mail) => {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(mail),
    });
    if (!response.ok) throw new Error(`mail webhook answered ${response.status}`);
  };
}
