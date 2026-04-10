# Weekly Email Delivery Implementation Guide

## Current State

The Metabolic Insights app has a complete weekly summary generation system that:
- Generates comprehensive health summaries every week
- Stores summaries in the database with markdown formatting
- Tracks delivery status (`needs_email_provider`)
- Includes glucose, activity, nutrition, sleep, and AI insights

**What's missing:** Automated email delivery and scheduled job orchestration.

## Implementation Options

### Option 1: SendGrid Integration (Recommended for Production)

#### 1. Install SendGrid Package
```bash
pnpm add @sendgrid/mail
```

#### 2. Add SendGrid API Key to Environment
```bash
# In your .env or via webdev_request_secrets
SENDGRID_API_KEY=your_sendgrid_api_key
```

#### 3. Create Email Service Module
Create `server/emailService.ts`:

```typescript
import sgMail from "@sendgrid/mail";

const sendWeeklyEmail = async (
  userEmail: string,
  subject: string,
  summaryMarkdown: string
) => {
  if (!process.env.SENDGRID_API_KEY) {
    throw new Error("SENDGRID_API_KEY not configured");
  }

  sgMail.setApiKey(process.env.SENDGRID_API_KEY);

  const htmlContent = convertMarkdownToHtml(summaryMarkdown);

  const msg = {
    to: userEmail,
    from: process.env.EMAIL_FROM_ADDRESS || "noreply@metabolic-insights.app",
    subject,
    html: htmlContent,
    text: summaryMarkdown,
  };

  try {
    await sgMail.send(msg);
    return { success: true, messageId: msg.messageId };
  } catch (error) {
    console.error("SendGrid error:", error);
    throw error;
  }
};

export { sendWeeklyEmail };
```

#### 4. Create Scheduled Job
Use `node-cron` or serverless functions (AWS Lambda, Google Cloud Functions):

```bash
pnpm add node-cron
```

Create `server/jobs/weeklyEmailJob.ts`:

```typescript
import cron from "node-cron";
import { getDb } from "../db";
import { weeklySummaries, users } from "../../drizzle/schema";
import { sendWeeklyEmail } from "../emailService";
import { eq, and, isNull } from "drizzle-orm";

// Run every Monday at 8 AM
export function scheduleWeeklyEmailJob() {
  cron.schedule("0 8 * * 1", async () => {
    console.log("Starting weekly email delivery job...");
    
    const db = await getDb();
    if (!db) return;

    // Get all summaries that need to be sent
    const pendingSummaries = await db
      .select()
      .from(weeklySummaries)
      .where(eq(weeklySummaries.deliveryStatus, "needs_email_provider"));

    for (const summary of pendingSummaries) {
      try {
        const user = await db
          .select()
          .from(users)
          .where(eq(users.id, summary.userId))
          .limit(1);

        if (!user[0]?.email) {
          console.warn(`No email for user ${summary.userId}`);
          continue;
        }

        await sendWeeklyEmail(
          user[0].email,
          summary.subject,
          summary.summaryMarkdown
        );

        // Update delivery status
        await db
          .update(weeklySummaries)
          .set({ deliveryStatus: "sent" })
          .where(eq(weeklySummaries.id, summary.id));

        console.log(`Email sent to ${user[0].email}`);
      } catch (error) {
        console.error(`Failed to send email for summary ${summary.id}:`, error);
        
        // Update with error status
        await db
          .update(weeklySummaries)
          .set({ deliveryStatus: "failed" })
          .where(eq(weeklySummaries.id, summary.id));
      }
    }

    console.log("Weekly email delivery job completed");
  });
}
```

#### 5. Initialize Job in Server Startup
In `server/_core/index.ts` or your main server file:

```typescript
import { scheduleWeeklyEmailJob } from "../jobs/weeklyEmailJob";

// After server initialization
scheduleWeeklyEmailJob();
console.log("Weekly email job scheduled");
```

### Option 2: Resend Integration (Modern Alternative)

#### 1. Install Resend Package
```bash
pnpm add resend
```

#### 2. Add Resend API Key
```bash
RESEND_API_KEY=your_resend_api_key
```

#### 3. Create Email Service
```typescript
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export const sendWeeklyEmail = async (
  userEmail: string,
  subject: string,
  summaryMarkdown: string
) => {
  const { data, error } = await resend.emails.send({
    from: "Metabolic Insights <noreply@metabolic-insights.app>",
    to: userEmail,
    subject,
    html: convertMarkdownToHtml(summaryMarkdown),
  });

  if (error) throw error;
  return data;
};
```

### Option 3: AWS SES (Enterprise)

For large-scale deployments, use AWS Simple Email Service with SNS for bounce/complaint handling.

## Database Schema Updates

Update `drizzle/schema.ts` to track email delivery:

```typescript
export const weeklySummaries = mysqlTable("weekly_summaries", {
  // ... existing fields ...
  deliveryStatus: mysqlEnum("deliveryStatus", [
    "needs_email_provider",
    "queued",
    "sent",
    "failed",
    "bounced",
  ]).default("needs_email_provider"),
  sentAt: bigint("sentAt", { mode: "number" }),
  failureReason: text("failureReason"),
  providerMessageId: varchar("providerMessageId", { length: 255 }),
});
```

## Testing

Add tests for email delivery:

```typescript
describe("Email Delivery", () => {
  it("should send weekly summary email", async () => {
    const result = await sendWeeklyEmail(
      "test@example.com",
      "Test Subject",
      "# Test Summary"
    );
    expect(result.success).toBe(true);
  });

  it("should handle SendGrid errors gracefully", async () => {
    await expect(
      sendWeeklyEmail("invalid", "Subject", "Content")
    ).rejects.toThrow();
  });
});
```

## Deployment Considerations

1. **Environment Variables**: Set API keys in production environment
2. **Rate Limiting**: Implement exponential backoff for failed sends
3. **Bounce Handling**: Set up webhook to handle email bounces
4. **Unsubscribe**: Add unsubscribe links to emails (required by law)
5. **Monitoring**: Log all email sends and failures
6. **Testing**: Use SendGrid/Resend sandbox mode for testing

## Next Steps

1. Choose email provider (SendGrid recommended for reliability)
2. Set up API key in environment variables
3. Implement email service module
4. Create scheduled job runner
5. Add database migrations for delivery tracking
6. Test end-to-end with real email
7. Set up monitoring and alerting

## Resources

- [SendGrid Node.js Documentation](https://docs.sendgrid.com/for-developers/sending-email/v3-nodejs-mail-send)
- [Resend Documentation](https://resend.com/docs)
- [node-cron Documentation](https://github.com/kelektiv/node-cron)
- [AWS SES Documentation](https://docs.aws.amazon.com/ses/)
