"use client";

import { useState, useCallback, useEffect } from "react";
import { apiFetch } from "@/lib/api-fetch";
import {
  Shield,
  Lock,
  Eye,
  Smartphone,
  Loader2,
  Check,
  AlertCircle,
  Copy,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";
import { Button } from "@/components/ui";

type Step = "idle" | "loading" | "qr" | "backup" | "disable";

interface TwoFactorStatus {
  enabled: boolean;
  loaded: boolean;
}

export function SecurityTab() {
  const [tfa, setTfa] = useState<TwoFactorStatus>({ enabled: false, loaded: false });
  const [step, setStep] = useState<Step>("idle");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState(false);
  const [disableCode, setDisableCode] = useState("");

  // Load 2FA status on mount
  const loadStatus = useCallback(async () => {
    try {
      const res = await apiFetch("/api/auth/two-factor/status");
      if (res.ok) {
        const data = await res.json();
        setTfa({ enabled: data.enabled, loaded: true });
      } else {
        setTfa({ enabled: false, loaded: true });
      }
    } catch {
      setTfa({ enabled: false, loaded: true });
    }
  }, []);

  // Trigger load on first render
  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const startSetup = async () => {
    setStep("loading");
    setError(null);
    try {
      const res = await apiFetch("/api/auth/two-factor/setup");
      if (!res.ok) {
        const data = await res.json();
        if (data.error?.includes("already enabled")) {
          setTfa({ enabled: true, loaded: true });
          setStep("idle");
          return;
        }
        throw new Error(data.error || "Failed to start setup");
      }
      const data = await res.json();
      setQrCode(data.qrCode);
      setSecret(data.secret);
      setStep("qr");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start 2FA setup");
      setStep("idle");
    }
  };

  const confirmSetup = async () => {
    if (code.length !== 6) return;
    setConfirming(true);
    setError(null);
    try {
      const res = await apiFetch("/api/auth/two-factor/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Verification failed");
      }
      const data = await res.json();
      setBackupCodes(data.backupCodes);
      setTfa({ enabled: true, loaded: true });
      setStep("backup");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
      setStep("qr");
    } finally {
      setConfirming(false);
    }
  };

  const disable2FA = async () => {
    if (disableCode.length < 6) return;
    setError(null);
    try {
      const res = await apiFetch("/api/auth/two-factor/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: disableCode }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to disable 2FA");
      }
      setTfa({ enabled: false, loaded: true });
      setStep("idle");
      setDisableCode("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disable 2FA");
    }
  };

  const copyBackupCodes = () => {
    navigator.clipboard.writeText(backupCodes.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Two-Factor Authentication */}
      <div className="rounded-2xl bg-surface-0 border border-surface-200 p-6 sm:p-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-brand-50 flex items-center justify-center">
              <Smartphone className="h-[18px] w-[18px] text-brand-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-surface-900">
                Two-Factor Authentication
              </h2>
              <p className="text-xs text-surface-500 mt-0.5">
                Add an extra layer of security to your account
              </p>
            </div>
          </div>
          {tfa.loaded && (
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                tfa.enabled
                  ? "bg-success-50 text-success-700"
                  : "bg-surface-100 text-surface-500"
              }`}
            >
              {tfa.enabled ? (
                <>
                  <ShieldCheck className="h-3 w-3" />
                  Enabled
                </>
              ) : (
                <>
                  <ShieldOff className="h-3 w-3" />
                  Disabled
                </>
              )}
            </span>
          )}
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-danger-50 px-3 py-2 text-xs text-danger-700">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {error}
          </div>
        )}

        {/* Idle state — show enable/disable button */}
        {step === "idle" && tfa.loaded && !tfa.enabled && (
          <div className="space-y-4">
            <p className="text-sm text-surface-600">
              Protect your financial data with TOTP-based two-factor authentication.
              You&apos;ll need an authenticator app like Google Authenticator, Authy, or 1Password.
            </p>
            <Button
              variant="primary"
              size="sm"
              icon={<Shield className="h-3.5 w-3.5" />}
              onClick={startSetup}
            >
              Enable 2FA
            </Button>
          </div>
        )}

        {step === "idle" && tfa.loaded && tfa.enabled && (
          <div className="space-y-4">
            <p className="text-sm text-success-700 bg-success-50 rounded-lg px-3 py-2">
              Two-factor authentication is active. Your account requires a TOTP code on every login.
            </p>
            <Button
              variant="danger"
              size="sm"
              icon={<ShieldOff className="h-3.5 w-3.5" />}
              onClick={() => {
                setStep("disable");
                setError(null);
              }}
            >
              Disable 2FA
            </Button>
          </div>
        )}

        {/* Loading */}
        {step === "loading" && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
          </div>
        )}

        {/* QR Code step */}
        {step === "qr" && qrCode && (
          <div className="space-y-5">
            <div className="space-y-3">
              <p className="text-sm font-medium text-surface-700">
                1. Scan this QR code with your authenticator app
              </p>
              <div className="flex justify-center">
                <div className="rounded-xl border border-surface-200 bg-white p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrCode} alt="2FA QR Code" width={200} height={200} />
                </div>
              </div>
              {secret && (
                <div className="text-center">
                  <p className="text-xs text-surface-500 mb-1">
                    Or enter this key manually:
                  </p>
                  <code className="text-xs font-mono bg-surface-100 px-3 py-1.5 rounded-lg text-surface-700 select-all">
                    {secret}
                  </code>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium text-surface-700">
                2. Enter the 6-digit code from your app
              </p>
              <div className="flex gap-3">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  className="w-36 rounded-xl border border-surface-300 bg-surface-0 px-4 py-3 text-center text-lg font-mono tracking-[0.3em] text-surface-900 placeholder:text-surface-300 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition-all"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") confirmSetup();
                  }}
                />
                <Button
                  variant="primary"
                  size="sm"
                  icon={
                    confirming ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )
                  }
                  disabled={code.length !== 6 || confirming}
                  onClick={confirmSetup}
                >
                  Verify
                </Button>
              </div>
            </div>

            <button
              onClick={() => {
                setStep("idle");
                setCode("");
                setError(null);
              }}
              className="text-xs text-surface-500 hover:text-surface-700 transition-colors"
            >
              Cancel setup
            </button>
          </div>
        )}

        {/* Backup codes step */}
        {step === "backup" && (
          <div className="space-y-5">
            <div className="flex items-center gap-2 rounded-lg bg-success-50 px-3 py-2">
              <ShieldCheck className="h-4 w-4 text-success-600 shrink-0" />
              <p className="text-sm font-medium text-success-700">
                Two-factor authentication is now enabled!
              </p>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium text-surface-700">
                Save your backup codes
              </p>
              <p className="text-xs text-surface-500">
                If you lose access to your authenticator app, you can use one of these
                one-time codes to sign in. Store them somewhere safe.
              </p>
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-surface-50 border border-surface-200 p-4">
                {backupCodes.map((bc, i) => (
                  <code
                    key={i}
                    className="text-sm font-mono text-surface-700 bg-surface-0 rounded-lg px-3 py-1.5 text-center border border-surface-100"
                  >
                    {bc}
                  </code>
                ))}
              </div>
              <div className="flex gap-3">
                <Button
                  variant={copied ? "success" : "secondary"}
                  size="sm"
                  icon={
                    copied ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )
                  }
                  onClick={copyBackupCodes}
                >
                  {copied ? "Copied!" : "Copy codes"}
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setStep("idle");
                    setCode("");
                    setBackupCodes([]);
                  }}
                >
                  Done
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Disable step */}
        {step === "disable" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-lg bg-warning-50 px-3 py-2">
              <AlertCircle className="h-4 w-4 text-warning-600 shrink-0" />
              <p className="text-sm text-warning-700">
                Enter your current TOTP code to disable two-factor authentication.
              </p>
            </div>
            <div className="flex gap-3">
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={disableCode}
                onChange={(e) =>
                  setDisableCode(e.target.value.replace(/\D/g, ""))
                }
                placeholder="000000"
                className="w-36 rounded-xl border border-surface-300 bg-surface-0 px-4 py-3 text-center text-lg font-mono tracking-[0.3em] text-surface-900 placeholder:text-surface-300 focus:outline-none focus:ring-2 focus:ring-danger-500/40 focus:border-danger-500 transition-all"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") disable2FA();
                }}
              />
              <Button
                variant="danger"
                size="sm"
                disabled={disableCode.length < 6}
                onClick={disable2FA}
              >
                Confirm Disable
              </Button>
            </div>
            <button
              onClick={() => {
                setStep("idle");
                setDisableCode("");
                setError(null);
              }}
              className="text-xs text-surface-500 hover:text-surface-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Security & Privacy Trust Signals */}
      <div className="rounded-2xl bg-surface-0 border border-surface-200 p-6 sm:p-8">
        <h2 className="text-base font-semibold text-surface-900 mb-6">
          Security & Privacy
        </h2>
        <div className="space-y-4">
          <div className="flex items-start gap-4 p-4 rounded-xl bg-surface-50 border border-surface-100">
            <div className="h-9 w-9 rounded-lg bg-success-50 flex items-center justify-center shrink-0">
              <Shield className="h-[18px] w-[18px] text-success-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-surface-900">
                Data encrypted at rest & in transit
              </p>
              <p className="text-xs text-surface-500 mt-0.5">
                AES-256 encryption for all financial data. TLS 1.3 for all
                connections.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-4 p-4 rounded-xl bg-surface-50 border border-surface-100">
            <div className="h-9 w-9 rounded-lg bg-success-50 flex items-center justify-center shrink-0">
              <Lock className="h-[18px] w-[18px] text-success-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-surface-900">
                SOC 2 Type II compliant architecture
              </p>
              <p className="text-xs text-surface-500 mt-0.5">
                Enterprise-grade security controls and access management.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-4 p-4 rounded-xl bg-surface-50 border border-surface-100">
            <div className="h-9 w-9 rounded-lg bg-success-50 flex items-center justify-center shrink-0">
              <Eye className="h-[18px] w-[18px] text-success-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-surface-900">
                Your data is never used for AI training
              </p>
              <p className="text-xs text-surface-500 mt-0.5">
                Full control over AI features. Disable anytime from the AI
                Features tab.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
