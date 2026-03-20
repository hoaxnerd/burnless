const BASE_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

function layout(content: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:40px 24px;">
  <div style="text-align:center;margin-bottom:32px;">
    <span style="font-size:24px;font-weight:700;color:#fff;letter-spacing:-0.5px;">Burnless</span>
  </div>
  <div style="background:#111;border:1px solid #222;border-radius:12px;padding:32px;">
    ${content}
  </div>
  <div style="text-align:center;margin-top:24px;color:#666;font-size:12px;">
    <p>&copy; ${new Date().getFullYear()} Burnless. AI-powered financial planning for startups.</p>
  </div>
</div>
</body>
</html>`;
}

export function welcomeEmail(name: string): { subject: string; html: string; text: string } {
  return {
    subject: "Welcome to Burnless",
    html: layout(`
      <h1 style="color:#fff;font-size:20px;margin:0 0 16px;">Welcome, ${name}!</h1>
      <p style="color:#ccc;line-height:1.6;margin:0 0 24px;">
        You're in. Burnless gives you AI-powered financial clarity — runway projections,
        burn rate tracking, and scenario planning built for founders.
      </p>
      <a href="${BASE_URL}/onboarding"
         style="display:inline-block;background:#fff;color:#000;font-weight:600;
                padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;">
        Start setup &rarr;
      </a>
      <p style="color:#666;font-size:13px;margin:24px 0 0;">
        Questions? Reply to this email — we read everything.
      </p>
    `),
    text: `Welcome to Burnless, ${name}!\n\nStart your setup: ${BASE_URL}/onboarding\n\nQuestions? Reply to this email.`,
  };
}

export function passwordResetEmail(
  resetUrl: string
): { subject: string; html: string; text: string } {
  return {
    subject: "Reset your Burnless password",
    html: layout(`
      <h1 style="color:#fff;font-size:20px;margin:0 0 16px;">Reset your password</h1>
      <p style="color:#ccc;line-height:1.6;margin:0 0 24px;">
        Someone requested a password reset for your Burnless account.
        Click below to choose a new password. This link expires in 1 hour.
      </p>
      <a href="${resetUrl}"
         style="display:inline-block;background:#fff;color:#000;font-weight:600;
                padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;">
        Reset password &rarr;
      </a>
      <p style="color:#666;font-size:13px;margin:24px 0 0;">
        If you didn't request this, ignore this email. Your password won't change.
      </p>
    `),
    text: `Reset your Burnless password:\n\n${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, ignore this email.`,
  };
}
