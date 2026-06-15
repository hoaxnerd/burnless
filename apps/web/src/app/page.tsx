import { LandingNav } from "@/components/landing/nav";
import { HeroSection } from "@/components/landing/hero";
import { TaglineBand } from "@/components/landing/tagline-band";
import { DashboardPreview } from "@/components/landing/dashboard-preview";
import { OpenSourceBand } from "@/components/landing/open-source-band";
import { Editions } from "@/components/landing/editions";
import { CTASection } from "@/components/landing/cta";
import { LandingFooter } from "@/components/landing/footer";

/* Landing defaults to light regardless of system preference; the nav theme
   toggle (ThemeToggle) lets a visitor override to dark and persists the choice
   to `burnless-theme`. This blocking script runs before paint so there's no
   flash from the root layout's system-based init. */
const themeInitScript = `(function(){try{var t=localStorage.getItem("burnless-theme");if(t==="dark"){document.documentElement.classList.add("dark")}else{document.documentElement.classList.remove("dark")}}catch(e){}})()`;

export default function HomePage() {
  return (
    <div className="min-h-screen bg-surface-0">
      <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      <LandingNav />
      <main>
        <HeroSection />
        <TaglineBand />
        <DashboardPreview />
        <OpenSourceBand />
        <Editions />
        <CTASection />
      </main>
      <LandingFooter />
    </div>
  );
}
