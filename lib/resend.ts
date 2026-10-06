/**
 * Email helper using Brevo when BREVO_API_KEY is set (it can email anyone once
 * a single sender address is verified, with no domain setup), otherwise Resend, for internal notifications (e.g. the daily
 * follow-up reminder). Not related to WhatsApp messaging.
 */
import { Resend } from "resend";

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

/**
 * Sends a transactional email via Brevo (BREVO_API_KEY + BREVO_SENDER_EMAIL,
 * optional BREVO_SENDER_NAME) or, if those aren't set, via Resend
 * (RESEND_API_KEY + RESEND_FROM_EMAIL).
 */
async function sendWithBrevo({ to, subject, html }: SendEmailParams) {
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": process.env.BREVO_API_KEY!,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: {
        email: process.env.BREVO_SENDER_EMAIL,
        name: process.env.BREVO_SENDER_NAME || "CREST CRM",
      },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || `Brevo responded with HTTP status ${response.status}.`);
  }
  return data;
}

export async function sendEmail({ to, subject, html }: SendEmailParams) {
  if (process.env.BREVO_API_KEY && process.env.BREVO_SENDER_EMAIL) {
    return sendWithBrevo({ to, subject, html });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured.");
  }
  if (!from) {
    throw new Error("RESEND_FROM_EMAIL is not configured.");
  }

  const resend = new Resend(apiKey);

  const { data, error } = await resend.emails.send({
    from,
    to,
    subject,
    html,
  });

  if (error) {
    throw new Error(error.message || "Failed to send email via Resend.");
  }

  return data;
}
