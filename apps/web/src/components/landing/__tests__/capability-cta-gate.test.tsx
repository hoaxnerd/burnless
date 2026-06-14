import { describe, it, expect } from "vitest";
import { render, within } from "@testing-library/react";
import { LandingNav } from "../nav";
import { CTASection } from "../cta";
import { HeroSection } from "../hero";
import { CapabilityProvider } from "@/components/providers/capability-context";
import { EDITION_PRESETS } from "@/lib/capabilities";
import { GITHUB_REPO_URL } from "@/lib/public-repo";

/**
 * Marketing CTAs gate on `selfServeSignup` (req 2c). When OFF (self_host preset
 * / cloud holding mode) every sign-in/up CTA becomes a "Star on GitHub" link;
 * when ON (cloud preset = signup open) real /login CTAs return. The view-source
 * GitHub icon in the nav (req 2b) is present in BOTH modes.
 */

function wrap(edition: "self_host" | "cloud", node: React.ReactNode) {
  return render(<CapabilityProvider value={EDITION_PRESETS[edition]}>{node}</CapabilityProvider>);
}

describe("landing CTA capability gate (selfServeSignup)", () => {
  it("cloud (signup ON): shows real /login CTAs, no GitHub CTA button", () => {
    const { getAllByText, queryByText } = wrap("cloud", <LandingNav />);
    // "Start free" → /login
    const startFree = getAllByText("Start free")[0]!.closest("a");
    expect(startFree).toHaveAttribute("href", "/login");
    expect(queryByText("Star on GitHub")).not.toBeInTheDocument();
  });

  it("self_host (signup OFF): sign-in CTAs become 'Star on GitHub' → repo", () => {
    const { getAllByText, queryByText } = wrap("self_host", <LandingNav />);
    expect(queryByText("Start free")).not.toBeInTheDocument();
    expect(queryByText("Log in")).not.toBeInTheDocument();
    const star = getAllByText("Star on GitHub")[0]!.closest("a");
    expect(star).toHaveAttribute("href", GITHUB_REPO_URL);
  });

  it("nav shows the view-source GitHub icon in BOTH editions (req 2b)", () => {
    for (const edition of ["self_host", "cloud"] as const) {
      const { getByLabelText, unmount } = wrap(edition, <LandingNav />);
      expect(getByLabelText("burnless on GitHub")).toHaveAttribute("href", GITHUB_REPO_URL);
      unmount();
    }
  });

  it("closing CTA band swaps Start free → Star on GitHub when signup is OFF", () => {
    const off = wrap("self_host", <CTASection />);
    expect(off.getByText("Star on GitHub").closest("a")).toHaveAttribute("href", GITHUB_REPO_URL);
    off.unmount();

    const on = wrap("cloud", <CTASection />);
    expect(on.getByText("Start free").closest("a")).toHaveAttribute("href", "/login");
  });

  it("hero primary CTA swaps Start free → Star on GitHub when signup is OFF", () => {
    const off = wrap("self_host", <HeroSection />);
    expect(within(off.container).getByText("Star on GitHub").closest("a")).toHaveAttribute(
      "href",
      GITHUB_REPO_URL,
    );
  });
});
