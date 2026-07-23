// packages/engine/src/competitor/__tests__/normalize.test.ts
import { describe, it, expect } from "vitest";
import { normalizeHtml } from "../normalize";

describe("normalizeHtml", () => {
  it("strips script/style/noscript/svg content", () => {
    const html = `<div>Hi<script>var x=1;track('a')</script><style>.a{}</style><svg><path/></svg></div>`;
    expect(normalizeHtml(html)).toBe("Hi");
  });

  it("drops attributes so nonce/CSRF churn does not change output", () => {
    const a = `<div class="x" data-nonce="aaaa1111"><p>Plan $29</p></div>`;
    const b = `<div class="y" data-nonce="zzzz9999"><p>Plan $29</p></div>`;
    expect(normalizeHtml(a)).toBe(normalizeHtml(b));
    expect(normalizeHtml(a)).toBe("Plan $29");
  });

  it("turns block boundaries into separate lines", () => {
    const html = `<ul><li>Free</li><li>Pro</li></ul><p>Enterprise</p>`;
    expect(normalizeHtml(html)).toBe("Free\nPro\nEnterprise");
  });

  it("collapses whitespace, decodes entities, drops empty lines", () => {
    const html = `<p>  A &amp;   B  </p>\n\n<p>&nbsp;</p><p>C&#39;s</p>`;
    expect(normalizeHtml(html)).toBe("A & B\nC's");
  });

  it("is idempotent-stable: comment-only difference yields identical text", () => {
    const a = `<p>Same</p><!-- build 111 -->`;
    const b = `<p>Same</p><!-- build 999 -->`;
    expect(normalizeHtml(a)).toBe(normalizeHtml(b));
  });

  it("returns empty string for tag-only / empty input", () => {
    expect(normalizeHtml(`<div></div>`)).toBe("");
    expect(normalizeHtml("")).toBe("");
  });
});
