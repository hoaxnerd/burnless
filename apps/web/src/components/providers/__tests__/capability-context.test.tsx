import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CapabilityProvider, useCapabilities } from "../capability-context";
import type { Capabilities } from "@/lib/capabilities";

function Probe() {
  const caps = useCapabilities();
  return <div>billing:{String(caps.billing)}</div>;
}

describe("CapabilityProvider", () => {
  it("exposes capabilities to children via hook", () => {
    const caps = { billing: false } as unknown as Capabilities;
    render(
      <CapabilityProvider value={caps}>
        <Probe />
      </CapabilityProvider>,
    );
    expect(screen.getByText("billing:false")).toBeTruthy();
  });
});
