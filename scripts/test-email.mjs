import { Resend } from "resend";

const resend = new Resend("re_gBcZhEvT_2NejaTGC99EgEPiKEoAzGW4f");

const result = await resend.emails.send({
  from: "HumanAIze <support@humanaize.life>",
  to: "donmcgowen@outlook.com",
  subject: "HumanAIze — Email Test ✅",
  html: `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #0f172a; color: #e2e8f0; padding: 32px; border-radius: 12px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #22d3ee; font-size: 28px; margin: 0;">HumanAIze</h1>
        <p style="color: #64748b; font-size: 14px; margin: 4px 0 0;">AI-Powered Health Intelligence</p>
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
});

if (result.error) {
  console.error("❌ Failed:", result.error);
  process.exit(1);
} else {
  console.log("✅ Email sent! ID:", result.data.id);
}
