import { Resend } from "resend";
import { ENV } from "./_core/env";

let _resend: Resend | null = null;
function getResend(): Resend {
  if (!ENV.resendApiKey) {
    throw new Error("RESEND_API_KEY is not configured — email sending is disabled");
  }
  if (!_resend) {
    _resend = new Resend(ENV.resendApiKey);
  }
  return _resend;
}

const FROM_ADDRESS = "HumanAIze <support@humanaize.life>";

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

/**
 * Send a transactional email via Resend.
 * From address is always support@humanaize.life.
 */
export async function sendEmail(options: SendEmailOptions): Promise<{ id: string }> {
  const { to, subject, html, text, replyTo } = options;

  const result = await getResend().emails.send({
    from: FROM_ADDRESS,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
    ...(text ? { text } : {}),
    ...(replyTo ? { reply_to: replyTo } : {}),
  });

  if (result.error) {
    throw new Error(`Resend error: ${result.error.message}`);
  }

  return { id: result.data!.id };
}

/**
 * Send a welcome email to a newly registered user.
 */
export async function sendWelcomeEmail(userEmail: string, userName: string): Promise<void> {
  await sendEmail({
    to: userEmail,
    subject: "Welcome to HumanAIze 🚀",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #0f172a; color: #e2e8f0; padding: 32px; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #22d3ee; font-size: 28px; margin: 0;">HumanAIze</h1>
          <p style="color: #64748b; font-size: 14px; margin: 4px 0 0;">AI-Powered Health Intelligence</p>
        </div>
        <h2 style="color: #f1f5f9;">Welcome, ${userName}! 👋</h2>
        <p style="color: #94a3b8; line-height: 1.6;">
          You're now part of HumanAIze — your personal AI health coach that helps you track nutrition,
          workouts, glucose, and more.
        </p>
        <p style="color: #94a3b8; line-height: 1.6;">Here's what you can do right now:</p>
        <ul style="color: #94a3b8; line-height: 2;">
          <li>📊 Log your meals and track macros</li>
          <li>🏋️ Record workouts and track progress</li>
          <li>🤖 Get your personalized AI health plan</li>
          <li>📈 Monitor trends and insights over time</li>
        </ul>
        <div style="text-align: center; margin: 32px 0;">
          <a href="https://humanaize.life" style="background: #22d3ee; color: #0f172a; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px;">
            Get Started →
          </a>
        </div>
        <p style="color: #475569; font-size: 12px; text-align: center; margin-top: 32px;">
          Questions? Reply to this email or contact us at support@humanaize.life
        </p>
      </div>
    `,
    text: `Welcome to HumanAIze, ${userName}!\n\nYou're now part of HumanAIze — your personal AI health coach.\n\nGet started at https://humanaize.life\n\nQuestions? Email support@humanaize.life`,
  });
}

/**
 * Send a test email to verify the Resend integration is working.
 */
export async function sendTestEmail(to: string): Promise<{ id: string }> {
  return sendEmail({
    to,
    subject: "HumanAIze — Email Test ✅",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #0f172a; color: #e2e8f0; padding: 32px; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #22d3ee; font-size: 28px; margin: 0;">HumanAIze</h1>
        </div>
        <h2 style="color: #22c55e;">✅ Email delivery is working!</h2>
        <p style="color: #94a3b8; line-height: 1.6;">
          This is a test email confirming that the Resend integration is configured correctly
          for <strong style="color: #e2e8f0;">humanaize.life</strong>.
        </p>
        <p style="color: #94a3b8;">Sent from: <strong style="color: #22d3ee;">support@humanaize.life</strong></p>
        <p style="color: #475569; font-size: 12px; margin-top: 32px; text-align: center;">
          HumanAIze · AI-Powered Health Intelligence
        </p>
      </div>
    `,
    text: "HumanAIze email test — delivery is working! Sent from support@humanaize.life",
  });
}
