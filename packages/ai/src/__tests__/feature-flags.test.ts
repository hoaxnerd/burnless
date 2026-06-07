import { describe, it, expect } from "vitest";
import {
  resolveFeatureStatus,
  canMakeLlmCall,
  canFeatureCallLlm,
  DEFAULT_AI_FLAGS,
  AI_FEATURE_LIST,
  type AiFeatureFlagsState,
  type AiFeatureName,
} from "../feature-flags";

describe("resolveFeatureStatus", () => {
  const allOn: AiFeatureFlagsState = {
    masterEnabled: true,
    dataMode: "full",
    writeMode: "confirm",
    companionName: "Assistant",
    features: {
      onboarding: true,
      chat: true,
      insights: true,
      uiPersonalization: true,
      autoCategorization: true,
      weeklyDigest: true,
    },
  };

  it("returns fully enabled when master on + feature on + full mode", () => {
    const status = resolveFeatureStatus(allOn, "chat");
    expect(status).toEqual({ enabled: true, canGenerate: true, showCached: true });
  });

  it("disables everything when master switch is off", () => {
    const flags: AiFeatureFlagsState = { ...allOn, masterEnabled: false };
    const status = resolveFeatureStatus(flags, "chat");
    expect(status).toEqual({ enabled: false, canGenerate: false, showCached: false });
  });

  it("disables when specific feature is off", () => {
    const flags: AiFeatureFlagsState = {
      ...allOn,
      features: { ...allOn.features, chat: false },
    };
    const status = resolveFeatureStatus(flags, "chat");
    expect(status).toEqual({ enabled: false, canGenerate: false, showCached: false });
  });

  it("allows cached only in show_cached mode", () => {
    const flags: AiFeatureFlagsState = { ...allOn, dataMode: "show_cached" };
    const status = resolveFeatureStatus(flags, "insights");
    expect(status).toEqual({ enabled: true, canGenerate: false, showCached: true });
  });

  it("hides everything in hide_all mode", () => {
    const flags: AiFeatureFlagsState = { ...allOn, dataMode: "hide_all" };
    const status = resolveFeatureStatus(flags, "insights");
    expect(status).toEqual({ enabled: false, canGenerate: false, showCached: false });
  });

  it("master off overrides even when individual feature is on", () => {
    const flags: AiFeatureFlagsState = {
      masterEnabled: false,
      dataMode: "full",
      writeMode: "confirm",
      companionName: "Assistant",
      features: { ...allOn.features, chat: true },
    };
    const status = resolveFeatureStatus(flags, "chat");
    expect(status.enabled).toBe(false);
    expect(status.canGenerate).toBe(false);
  });

  it("works for every feature name", () => {
    const featureNames: AiFeatureName[] = [
      "onboarding", "chat", "insights",
      "uiPersonalization", "autoCategorization", "weeklyDigest",
    ];
    for (const name of featureNames) {
      const status = resolveFeatureStatus(allOn, name);
      expect(status.enabled).toBe(true);
    }
  });
});

describe("canMakeLlmCall", () => {
  it("returns true when master on and full mode", () => {
    expect(canMakeLlmCall({ ...DEFAULT_AI_FLAGS, masterEnabled: true, dataMode: "full" })).toBe(true);
  });

  it("returns false when master off", () => {
    expect(canMakeLlmCall({ ...DEFAULT_AI_FLAGS, masterEnabled: false, dataMode: "full" })).toBe(false);
  });

  it("returns false in show_cached mode", () => {
    expect(canMakeLlmCall({ ...DEFAULT_AI_FLAGS, masterEnabled: true, dataMode: "show_cached" })).toBe(false);
  });

  it("returns false in hide_all mode", () => {
    expect(canMakeLlmCall({ ...DEFAULT_AI_FLAGS, masterEnabled: true, dataMode: "hide_all" })).toBe(false);
  });
});

describe("canFeatureCallLlm", () => {
  const allOn: AiFeatureFlagsState = { ...DEFAULT_AI_FLAGS };

  it("returns true when master on + full mode + feature on", () => {
    expect(canFeatureCallLlm(allOn, "chat")).toBe(true);
  });

  it("returns false when feature is off even if master on + full", () => {
    const flags: AiFeatureFlagsState = {
      ...allOn,
      features: { ...allOn.features, chat: false },
    };
    expect(canFeatureCallLlm(flags, "chat")).toBe(false);
  });

  it("returns false when master is off", () => {
    const flags: AiFeatureFlagsState = { ...allOn, masterEnabled: false };
    expect(canFeatureCallLlm(flags, "chat")).toBe(false);
  });
});

describe("DEFAULT_AI_FLAGS", () => {
  it("has master enabled by default", () => {
    expect(DEFAULT_AI_FLAGS.masterEnabled).toBe(true);
  });

  it("defaults to full data mode", () => {
    expect(DEFAULT_AI_FLAGS.dataMode).toBe("full");
  });

  it("has all 6 features enabled", () => {
    const features = DEFAULT_AI_FLAGS.features;
    expect(features.onboarding).toBe(true);
    expect(features.chat).toBe(true);
    expect(features.insights).toBe(true);
    expect(features.uiPersonalization).toBe(true);
    expect(features.autoCategorization).toBe(true);
    expect(features.weeklyDigest).toBe(true);
  });
});

describe("AI_FEATURE_LIST", () => {
  it("contains 6 features", () => {
    expect(AI_FEATURE_LIST).toHaveLength(6);
  });

  it("every entry has name, label, and description", () => {
    for (const feat of AI_FEATURE_LIST) {
      expect(feat.name).toBeTruthy();
      expect(feat.label).toBeTruthy();
      expect(feat.description).toBeTruthy();
    }
  });

  it("feature names match the AiFeatureName type values", () => {
    const names = AI_FEATURE_LIST.map((f) => f.name).sort();
    expect(names).toEqual([
      "autoCategorization", "chat", "insights",
      "onboarding", "uiPersonalization", "weeklyDigest",
    ]);
  });
});
