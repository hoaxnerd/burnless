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

interface DigestEmailData {
  companyName: string;
  narrative: string | null;
  deterministicSummary: string;
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

function formatCurrencyEmail(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}k`;
  return `$${value.toFixed(0)}`;
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

export function weeklyDigestEmail(
  data: DigestEmailData
): { subject: string; html: string; text: string } {
  const { metrics: m, narrative, deterministicSummary, companyName } = data;

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
        ${metricRow("Cash Position", formatCurrencyEmail(m.cashPosition), m.cashChangePercent)}
        ${metricRow("Monthly Burn", formatCurrencyEmail(m.burnRate), m.burnChangePercent)}
        ${metricRow("Runway", `${Math.round(m.runway)} mo`)}
        ${m.mrr > 0 ? metricRow("MRR", formatCurrencyEmail(m.mrr), m.mrrChangePercent) : ""}
        ${metricRow("Total Expenses", formatCurrencyEmail(m.totalExpenses), m.expenseChangePercent)}
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
