import { formatCurrency, type CurrencyCode } from "@burnless/types";

const BASE_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

function layout(content: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:40px 24px;">
  <div style="text-align:center;margin-bottom:32px;">
    <span style="font-size:24px;font-weight:700;color:#fff;letter-spacing:-0.5px;">burnless</span>
  </div>
  <div style="background:#111;border:1px solid #222;border-radius:12px;padding:32px;">
    ${content}
  </div>
  <div style="text-align:center;margin-top:24px;color:#666;font-size:12px;">
    <p>&copy; ${new Date().getFullYear()} burnless. AI-powered financial planning for startups.</p>
  </div>
</div>
</body>
</html>`;
}

export function verificationEmail(
  verifyUrl: string
): { subject: string; html: string; text: string } {
  return {
    subject: "Verify your burnless email",
    html: layout(`
      <h1 style="color:#fff;font-size:20px;margin:0 0 16px;">Verify your email</h1>
      <p style="color:#ccc;line-height:1.6;margin:0 0 24px;">
        Click below to verify your email and get started with burnless.
        This link expires in 24 hours.
      </p>
      <a href="${verifyUrl}"
         style="display:inline-block;background:#fff;color:#000;font-weight:600;
                padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;">
        Verify email &rarr;
      </a>
      <p style="color:#666;font-size:13px;margin:24px 0 0;">
        If you didn't create a burnless account, ignore this email.
      </p>
    `),
    text: `Verify your burnless email:\n\n${verifyUrl}\n\nThis link expires in 24 hours. If you didn't create an account, ignore this email.`,
  };
}

export function welcomeEmail(name: string): { subject: string; html: string; text: string } {
  return {
    subject: "Welcome to burnless",
    html: layout(`
      <h1 style="color:#fff;font-size:20px;margin:0 0 16px;">Welcome, ${name}!</h1>
      <p style="color:#ccc;line-height:1.6;margin:0 0 24px;">
        You're in. burnless gives you AI-powered financial clarity — runway projections,
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
    text: `Welcome to burnless, ${name}!\n\nStart your setup: ${BASE_URL}/onboarding\n\nQuestions? Reply to this email.`,
  };
}

export function passwordResetEmail(
  resetUrl: string
): { subject: string; html: string; text: string } {
  return {
    subject: "Reset your burnless password",
    html: layout(`
      <h1 style="color:#fff;font-size:20px;margin:0 0 16px;">Reset your password</h1>
      <p style="color:#ccc;line-height:1.6;margin:0 0 24px;">
        Someone requested a password reset for your burnless account.
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
    text: `Reset your burnless password:\n\n${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, ignore this email.`,
  };
}

interface DigestEmailData {
  companyName: string;
  narrative: string | null;
  deterministicSummary: string;
  currency: CurrencyCode;
  metrics: {
    cashPosition: number;
    cashChangePercent: number;
    burnRate: number;
    burnChangePercent: number;
    runway: number;
    mrr: number;
    mrrChangePercent: number;
    totalExpenses: number;
    expenseChangePercent: number;
    anomalyCount: number;
    headcount: number;
  };
}

function changeArrow(pct: number): string {
  if (pct > 0) return `<span style="color:#22c55e;">&uarr; ${pct.toFixed(1)}%</span>`;
  if (pct < 0) return `<span style="color:#ef4444;">&darr; ${Math.abs(pct).toFixed(1)}%</span>`;
  return `<span style="color:#888;">0%</span>`;
}

function metricRow(label: string, value: string, change?: number): string {
  return `<tr>
    <td style="padding:10px 0;border-bottom:1px solid #222;color:#999;font-size:13px;">${label}</td>
    <td style="padding:10px 0;border-bottom:1px solid #222;color:#fff;font-size:14px;font-weight:600;text-align:right;">${value}</td>
    <td style="padding:10px 0;border-bottom:1px solid #222;font-size:12px;text-align:right;padding-left:12px;">${change !== undefined ? changeArrow(change) : ""}</td>
  </tr>`;
}

// ---------------------------------------------------------------------------
// Billing emails
// ---------------------------------------------------------------------------

const PLAN_DISPLAY: Record<string, string> = {
  pro: "Pro",
  team: "Team",
  free: "Free",
};

export function subscriptionConfirmedEmail(
  plan: string
): { subject: string; html: string; text: string } {
  const planName = PLAN_DISPLAY[plan] ?? plan;
  return {
    subject: `You're on burnless ${planName}`,
    html: layout(`
      <h1 style="color:#fff;font-size:20px;margin:0 0 16px;">Subscription confirmed</h1>
      <p style="color:#ccc;line-height:1.6;margin:0 0 24px;">
        Your burnless <strong style="color:#fff;">${planName}</strong> plan is now active.
        You have full access to all ${planName} features.
      </p>
      <a href="${BASE_URL}/settings?tab=billing"
         style="display:inline-block;background:#fff;color:#000;font-weight:600;
                padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;">
        Manage billing &rarr;
      </a>
      <p style="color:#666;font-size:13px;margin:24px 0 0;">
        You can manage your subscription, update payment methods, or download invoices from the billing settings page.
      </p>
    `),
    text: `Subscription confirmed — burnless ${planName}\n\nYour ${planName} plan is now active. Manage billing: ${BASE_URL}/settings?tab=billing`,
  };
}

export function paymentFailedEmail(): { subject: string; html: string; text: string } {
  return {
    subject: "burnless — payment failed",
    html: layout(`
      <h1 style="color:#fff;font-size:20px;margin:0 0 16px;">Payment failed</h1>
      <p style="color:#ccc;line-height:1.6;margin:0 0 24px;">
        We couldn't process your latest payment. Please update your payment method
        to keep your plan active. If the issue persists, your account will be
        downgraded to the Free plan.
      </p>
      <a href="${BASE_URL}/settings?tab=billing"
         style="display:inline-block;background:#fff;color:#000;font-weight:600;
                padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;">
        Update payment &rarr;
      </a>
      <p style="color:#666;font-size:13px;margin:24px 0 0;">
        Questions? Reply to this email.
      </p>
    `),
    text: `Payment failed — burnless\n\nPlease update your payment method: ${BASE_URL}/settings?tab=billing`,
  };
}

export function subscriptionCanceledEmail(
  periodEnd: Date
): { subject: string; html: string; text: string } {
  const endStr = periodEnd.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  return {
    subject: "burnless — subscription cancellation scheduled",
    html: layout(`
      <h1 style="color:#fff;font-size:20px;margin:0 0 16px;">Cancellation scheduled</h1>
      <p style="color:#ccc;line-height:1.6;margin:0 0 24px;">
        Your subscription will remain active until <strong style="color:#fff;">${endStr}</strong>.
        After that date your account will be downgraded to the Free plan.
      </p>
      <p style="color:#ccc;line-height:1.6;margin:0 0 24px;">
        Changed your mind? You can reactivate anytime before ${endStr} from your billing settings.
      </p>
      <a href="${BASE_URL}/settings?tab=billing"
         style="display:inline-block;background:#fff;color:#000;font-weight:600;
                padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;">
        Manage subscription &rarr;
      </a>
    `),
    text: `Cancellation scheduled — burnless\n\nYour plan stays active until ${endStr}. Reactivate: ${BASE_URL}/settings?tab=billing`,
  };
}

export function weeklyDigestEmail(
  data: DigestEmailData
): { subject: string; html: string; text: string } {
  const { metrics: m, narrative, deterministicSummary, companyName, currency } = data;

  const narrativeHtml = narrative
    ? `<div style="background:#1a1a2e;border:1px solid #333;border-radius:8px;padding:16px;margin:0 0 24px;">
        <p style="color:#a78bfa;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin:0 0 8px;">AI CFO Briefing</p>
        <p style="color:#e2e8f0;font-size:13px;line-height:1.7;margin:0;white-space:pre-wrap;">${narrative}</p>
      </div>`
    : "";

  const runwayWarning =
    m.runway > 0 && m.runway <= 6
      ? `<div style="background:#7f1d1d;border:1px solid #991b1b;border-radius:8px;padding:12px;margin:0 0 16px;">
          <p style="color:#fca5a5;font-size:13px;font-weight:600;margin:0;">&#9888; Runway Alert: ${Math.round(m.runway)} months remaining</p>
        </div>`
      : "";

  const anomalyBadge =
    m.anomalyCount > 0
      ? `<div style="background:#78350f;border:1px solid #92400e;border-radius:8px;padding:10px;margin:0 0 16px;">
          <p style="color:#fbbf24;font-size:12px;margin:0;">${m.anomalyCount} spend anomal${m.anomalyCount === 1 ? "y" : "ies"} detected this period</p>
        </div>`
      : "";

  return {
    subject: `Monday Morning CFO — ${companyName}`,
    html: layout(`
      <h1 style="color:#fff;font-size:20px;margin:0 0 4px;">Monday Morning CFO</h1>
      <p style="color:#666;font-size:12px;margin:0 0 20px;">${companyName} &mdash; Weekly Financial Digest</p>

      ${runwayWarning}
      ${anomalyBadge}
      ${narrativeHtml}

      <table style="width:100%;border-collapse:collapse;">
        ${metricRow("Cash Position", formatCurrency(m.cashPosition, currency, undefined, { compact: true }), m.cashChangePercent)}
        ${metricRow("Monthly Burn", formatCurrency(m.burnRate, currency, undefined, { compact: true }), m.burnChangePercent)}
        ${metricRow("Runway", `${Math.round(m.runway)} mo`)}
        ${m.mrr > 0 ? metricRow("MRR", formatCurrency(m.mrr, currency, undefined, { compact: true }), m.mrrChangePercent) : ""}
        ${metricRow("Total Expenses", formatCurrency(m.totalExpenses, currency, undefined, { compact: true }), m.expenseChangePercent)}
        ${m.headcount > 0 ? metricRow("Headcount", String(m.headcount)) : ""}
      </table>

      <div style="margin-top:24px;text-align:center;">
        <a href="${BASE_URL}/dashboard"
           style="display:inline-block;background:#fff;color:#000;font-weight:600;
                  padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;">
          View Dashboard &rarr;
        </a>
      </div>
      <p style="color:#555;font-size:11px;margin:20px 0 0;text-align:center;">
        Manage digest preferences in <a href="${BASE_URL}/settings" style="color:#888;">Settings</a>
      </p>
    `),
    text: deterministicSummary,
  };
}
