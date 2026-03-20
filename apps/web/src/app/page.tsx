import { LandingNav } from "@/components/landing/nav";
import { HeroSection } from "@/components/landing/hero";
import { SocialProofBar } from "@/components/landing/social-proof";
import { FeatureBento } from "@/components/landing/features";
import { AIDemoSection } from "@/components/landing/ai-demo";
import { CTASection } from "@/components/landing/cta";
import { LandingFooter } from "@/components/landing/footer";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-surface-0">
      <LandingNav />
      <main>
        <HeroSection />
        <SocialProofBar />
        <FeatureBento />
        <AIDemoSection />
        <CTASection />
      </main>
      <LandingFooter />
    </div>
  );
}
