import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-50 px-4">
      <div className="text-center max-w-md">
        <BrandLogo className="mx-auto h-16 w-16 mb-6" />
        <h1 className="text-4xl font-bold text-surface-900 mb-2">404</h1>
        <p className="text-lg text-surface-600 mb-8">
          This page doesn&apos;t exist or has been moved.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
          >
            Go to Dashboard
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-lg border border-surface-300 bg-white px-5 py-2.5 text-sm font-medium text-surface-700 hover:bg-surface-50 transition-colors"
          >
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
