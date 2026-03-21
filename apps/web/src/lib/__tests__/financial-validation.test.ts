import { describe, it, expect } from "vitest";
import { monetaryAmount, positiveAmount, percentage, ratio } from "../financial-validation";

describe("monetaryAmount", () => {
  const schema = monetaryAmount();

  it("accepts valid positive and negative amounts", () => {
    expect(schema.parse(100)).toBe(100);
    expect(schema.parse(-500.50)).toBe(-500.50);
    expect(schema.parse(0)).toBe(0);
    expect(schema.parse(999999999)).toBe(999999999);
  });

  it("rejects NaN", () => {
    expect(() => schema.parse(NaN)).toThrow();
  });

  it("rejects Infinity", () => {
    expect(() => schema.parse(Infinity)).toThrow();
    expect(() => schema.parse(-Infinity)).toThrow();
  });

  it("rejects non-numbers", () => {
    expect(() => schema.parse("100")).toThrow();
    expect(() => schema.parse(null)).toThrow();
    expect(() => schema.parse(undefined)).toThrow();
  });
});

describe("positiveAmount", () => {
  const schema = positiveAmount();

  it("accepts zero and positive amounts", () => {
    expect(schema.parse(0)).toBe(0);
    expect(schema.parse(1000000)).toBe(1000000);
  });

  it("rejects negative amounts", () => {
    expect(() => schema.parse(-1)).toThrow();
    expect(() => schema.parse(-0.01)).toThrow();
  });

  it("rejects NaN and Infinity", () => {
    expect(() => schema.parse(NaN)).toThrow();
    expect(() => schema.parse(Infinity)).toThrow();
  });
});

describe("percentage", () => {
  const schema = percentage();

  it("accepts 0–100", () => {
    expect(schema.parse(0)).toBe(0);
    expect(schema.parse(50)).toBe(50);
    expect(schema.parse(100)).toBe(100);
    expect(schema.parse(15.5)).toBe(15.5);
  });

  it("rejects values outside 0–100", () => {
    expect(() => schema.parse(-1)).toThrow();
    expect(() => schema.parse(101)).toThrow();
  });

  it("rejects NaN", () => {
    expect(() => schema.parse(NaN)).toThrow();
  });
});

describe("ratio", () => {
  const schema = ratio();

  it("accepts 0–1", () => {
    expect(schema.parse(0)).toBe(0);
    expect(schema.parse(0.5)).toBe(0.5);
    expect(schema.parse(1)).toBe(1);
  });

  it("rejects values outside 0–1", () => {
    expect(() => schema.parse(-0.01)).toThrow();
    expect(() => schema.parse(1.01)).toThrow();
  });

  it("rejects NaN and Infinity", () => {
    expect(() => schema.parse(NaN)).toThrow();
    expect(() => schema.parse(Infinity)).toThrow();
  });
});
