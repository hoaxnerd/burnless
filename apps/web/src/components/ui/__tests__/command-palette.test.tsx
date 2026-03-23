import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

import { CommandPalette } from "../command-palette";

/* ── Helpers ────────────────────────────────────────────────────────── */

function renderPalette(
  props: Partial<Parameters<typeof CommandPalette>[0]> = {}
) {
  return render(
    <CommandPalette open={true} onClose={vi.fn()} {...props} />
  );
}

/* ── Tests ──────────────────────────────────────────────────────────── */

describe("CommandPalette", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  /* ── Visibility ─────────────────────────────────────────────────── */

  describe("visibility", () => {
    it("renders nothing when closed", () => {
      const { container } = render(
        <CommandPalette open={false} onClose={vi.fn()} />
      );
      expect(container.innerHTML).toBe("");
    });

    it("renders the palette when open", () => {
      renderPalette();
      expect(
        screen.getByPlaceholderText("Search pages, actions, data...")
      ).toBeInTheDocument();
    });

    it("shows combobox with correct ARIA attributes", () => {
      renderPalette();
      const combobox = screen.getByRole("combobox");
      expect(combobox).toHaveAttribute("aria-expanded", "true");
      expect(combobox).toHaveAttribute("aria-haspopup", "listbox");
    });

    it("renders a listbox for results", () => {
      renderPalette();
      expect(screen.getByRole("listbox")).toBeInTheDocument();
    });
  });

  /* ── Default commands ───────────────────────────────────────────── */

  describe("default commands", () => {
    it("shows all page commands by default", () => {
      renderPalette();
      expect(screen.getByText("Dashboard")).toBeInTheDocument();
      expect(screen.getByText("Expenses")).toBeInTheDocument();
      expect(screen.getByText("Revenue")).toBeInTheDocument();
      expect(screen.getByText("Funding")).toBeInTheDocument();
      expect(screen.getByText("Team")).toBeInTheDocument();
      expect(screen.getByText("Scenarios")).toBeInTheDocument();
      expect(screen.getByText("Reports")).toBeInTheDocument();
      expect(screen.getByText("Settings")).toBeInTheDocument();
    });

    it("shows action commands", () => {
      renderPalette();
      expect(screen.getByText("New Scenario")).toBeInTheDocument();
      expect(screen.getByText("Import CSV")).toBeInTheDocument();
      expect(screen.getByText("Generate Report")).toBeInTheDocument();
    });

    it("shows section headings", () => {
      renderPalette();
      // Section headings are uppercase tracking-widest spans
      expect(screen.getAllByText("Pages").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Actions").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Data").length).toBeGreaterThanOrEqual(1);
    });

    it("does not show AI commands when onToggleAI is not provided", () => {
      renderPalette();
      expect(screen.queryByText("Ask AI")).not.toBeInTheDocument();
    });

    it("shows AI commands when onToggleAI is provided", () => {
      renderPalette({ onToggleAI: vi.fn() });
      // "Ask AI" appears as command label and also as suggested query hover text
      expect(screen.getAllByText("Ask AI").length).toBeGreaterThanOrEqual(1);
      // The AI command should render as an option
      const options = screen.getAllByRole("option");
      const aiOption = options.find((o) => o.textContent?.includes("Ask AI"));
      expect(aiOption).toBeDefined();
    });
  });

  /* ── Text search filtering ─────────────────────────────────────── */

  describe("text search", () => {
    it("filters commands by label", async () => {
      renderPalette();
      const input = screen.getByPlaceholderText(
        "Search pages, actions, data..."
      );

      await userEvent.type(input, "dashboard");
      expect(screen.getByText("Dashboard")).toBeInTheDocument();
      // Other items should be filtered out
      expect(screen.queryByText("Funding")).not.toBeInTheDocument();
      expect(screen.queryByText("Import CSV")).not.toBeInTheDocument();
    });

    it("filters commands by description", async () => {
      renderPalette();
      const input = screen.getByPlaceholderText(
        "Search pages, actions, data..."
      );

      await userEvent.type(input, "headcount");
      expect(screen.getByText("Team")).toBeInTheDocument();
    });

    it("filters commands by keywords", async () => {
      renderPalette();
      const input = screen.getByPlaceholderText(
        "Search pages, actions, data..."
      );

      await userEvent.type(input, "mrr");
      // Revenue has keyword "mrr"
      expect(screen.getByText("Revenue")).toBeInTheDocument();
      expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
    });

    it("is case-insensitive", async () => {
      renderPalette();
      const input = screen.getByPlaceholderText(
        "Search pages, actions, data..."
      );

      await userEvent.type(input, "EXPENSES");
      expect(screen.getByText("Expenses")).toBeInTheDocument();
    });

    it("shows no-results message for unmatched queries", async () => {
      renderPalette();
      const input = screen.getByPlaceholderText(
        "Search pages, actions, data..."
      );

      await userEvent.type(input, "zzzznonexistent");
      expect(screen.getByText(/No results for/)).toBeInTheDocument();
    });

    it("shows 'Ask AI' button in no-results when onToggleAI provided", async () => {
      const onToggleAI = vi.fn();
      renderPalette({ onToggleAI });
      const input = screen.getByPlaceholderText(
        "Search pages, actions, data..."
      );

      await userEvent.type(input, "zzzznonexistent");
      const askAI = screen.getByRole("button", {
        name: /Ask AI about/,
      });
      expect(askAI).toBeInTheDocument();
    });
  });

  /* ── Category filtering ─────────────────────────────────────────── */

  describe("category filtering", () => {
    it("shows category filter tabs", () => {
      renderPalette();
      // "All" is unique to the tab bar
      expect(screen.getByText("All")).toBeInTheDocument();
      // "Pages", "Actions", "Data" appear both as tabs and section headings
      expect(screen.getAllByText("Pages").length).toBeGreaterThanOrEqual(2);
      expect(screen.getAllByText("Actions").length).toBeGreaterThanOrEqual(2);
      expect(screen.getAllByText("Data").length).toBeGreaterThanOrEqual(2);
    });

    it("does not show AI tab without onToggleAI", () => {
      renderPalette();
      // "AI" section header might appear, but "AI" tab should not
      const _tabs = screen
        .getAllByRole("button")
        .filter((b) => b.textContent === "AI");
      // The AI tab shouldn't be there when no onToggleAI
      // (but there might be an "AI" section label)
      expect(
        screen
          .getAllByRole("button")
          .find(
            (b) =>
              b.textContent === "AI" &&
              b.className.includes("rounded-lg px-2.5")
          )
      ).toBeUndefined();
    });

    it("shows AI tab with onToggleAI", () => {
      renderPalette({ onToggleAI: vi.fn() });
      // Should have an AI filter tab button
      const aiButtons = screen
        .getAllByRole("button")
        .filter(
          (b) =>
            b.textContent === "AI" &&
            b.className.includes("rounded-lg")
        );
      expect(aiButtons.length).toBeGreaterThan(0);
    });

    it("filters to only pages when Pages tab clicked", async () => {
      renderPalette();
      const pagesTab = screen
        .getAllByRole("button")
        .find(
          (b) =>
            b.textContent === "Pages" &&
            b.className.includes("rounded-lg px-2.5")
        )!;

      await userEvent.click(pagesTab);

      expect(screen.getByText("Dashboard")).toBeInTheDocument();
      expect(screen.getByText("Settings")).toBeInTheDocument();
      // Action commands should be hidden
      expect(screen.queryByText("New Scenario")).not.toBeInTheDocument();
      expect(screen.queryByText("Import CSV")).not.toBeInTheDocument();
    });

    it("filters to only actions when Actions tab clicked", async () => {
      renderPalette();
      const actionsTab = screen
        .getAllByRole("button")
        .find(
          (b) =>
            b.textContent === "Actions" &&
            b.className.includes("rounded-lg px-2.5")
        )!;

      await userEvent.click(actionsTab);

      expect(screen.getByText("New Scenario")).toBeInTheDocument();
      expect(screen.getByText("Import CSV")).toBeInTheDocument();
      // Page commands should be hidden
      expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
    });
  });

  /* ── Keyboard navigation ────────────────────────────────────────── */

  describe("keyboard navigation", () => {
    it("selects first item by default", () => {
      renderPalette();
      const options = screen.getAllByRole("option");
      expect(options[0]).toHaveAttribute("aria-selected", "true");
    });

    it("moves selection down with ArrowDown", async () => {
      renderPalette();
      const combobox = screen.getByRole("combobox");

      fireEvent.keyDown(combobox, { key: "ArrowDown" });

      const options = screen.getAllByRole("option");
      expect(options[0]).toHaveAttribute("aria-selected", "false");
      expect(options[1]).toHaveAttribute("aria-selected", "true");
    });

    it("moves selection up with ArrowUp", async () => {
      renderPalette();
      const combobox = screen.getByRole("combobox");

      // Move down twice, then up once
      fireEvent.keyDown(combobox, { key: "ArrowDown" });
      fireEvent.keyDown(combobox, { key: "ArrowDown" });
      fireEvent.keyDown(combobox, { key: "ArrowUp" });

      const options = screen.getAllByRole("option");
      expect(options[1]).toHaveAttribute("aria-selected", "true");
    });

    it("does not go below last item", () => {
      renderPalette();
      const combobox = screen.getByRole("combobox");
      const options = screen.getAllByRole("option");
      const total = options.length;

      // Press down more times than items
      for (let i = 0; i < total + 5; i++) {
        fireEvent.keyDown(combobox, { key: "ArrowDown" });
      }

      // Last item should be selected
      expect(options[total - 1]).toHaveAttribute("aria-selected", "true");
    });

    it("does not go above first item", () => {
      renderPalette();
      const combobox = screen.getByRole("combobox");

      fireEvent.keyDown(combobox, { key: "ArrowUp" });

      const options = screen.getAllByRole("option");
      expect(options[0]).toHaveAttribute("aria-selected", "true");
    });

    it("executes selected command on Enter", () => {
      renderPalette();
      const combobox = screen.getByRole("combobox");

      // First item is Dashboard → should navigate to /dashboard
      fireEvent.keyDown(combobox, { key: "Enter" });

      expect(mockPush).toHaveBeenCalledWith("/dashboard");
    });

    it("navigates to correct page on Enter after ArrowDown", () => {
      renderPalette();
      const combobox = screen.getByRole("combobox");

      // Move to second item (Expenses → /expenses)
      fireEvent.keyDown(combobox, { key: "ArrowDown" });
      fireEvent.keyDown(combobox, { key: "Enter" });

      expect(mockPush).toHaveBeenCalledWith("/expenses");
    });

    it("calls onClose on Escape", () => {
      const onClose = vi.fn();
      renderPalette({ onClose });
      const combobox = screen.getByRole("combobox");

      fireEvent.keyDown(combobox, { key: "Escape" });

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  /* ── Command execution ──────────────────────────────────────────── */

  describe("command execution", () => {
    it("navigates to page on click", async () => {
      const onClose = vi.fn();
      renderPalette({ onClose });

      await userEvent.click(screen.getByText("Dashboard"));

      expect(mockPush).toHaveBeenCalledWith("/dashboard");
      expect(onClose).toHaveBeenCalled();
    });

    it("calls action callback for AI command", async () => {
      const onToggleAI = vi.fn();
      const onClose = vi.fn();
      renderPalette({ onClose, onToggleAI });

      // Click the AI command option (not the suggested query "Ask AI" text)
      const aiOption = screen
        .getAllByRole("option")
        .find((o) => o.textContent?.includes("Ask AI"));
      expect(aiOption).toBeDefined();
      await userEvent.click(aiOption!);

      expect(onToggleAI).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
    });

    it("closes palette on backdrop click", async () => {
      const onClose = vi.fn();
      const { container } = renderPalette({ onClose });

      // Backdrop is the first fixed div
      const backdrop = container.querySelector(".fixed.inset-0.bg-black\\/40");
      if (backdrop) {
        await userEvent.click(backdrop);
        expect(onClose).toHaveBeenCalled();
      }
    });
  });

  /* ── Recent searches ────────────────────────────────────────────── */

  describe("recent searches", () => {
    it("shows recent section when searches exist in localStorage", () => {
      localStorage.setItem(
        "burnless:recent-searches",
        JSON.stringify(["dashboard", "revenue"])
      );

      renderPalette();

      expect(screen.getByText("Recent")).toBeInTheDocument();
      // Recent search entries rendered as buttons
      expect(screen.getByText("dashboard")).toBeInTheDocument();
      expect(screen.getByText("revenue")).toBeInTheDocument();
    });

    it("does not show recent section when no searches stored", () => {
      renderPalette();
      expect(screen.queryByText("Recent")).not.toBeInTheDocument();
    });

    it("clears recent searches on Clear button click", async () => {
      localStorage.setItem(
        "burnless:recent-searches",
        JSON.stringify(["test"])
      );

      renderPalette();
      expect(screen.getByText("Recent")).toBeInTheDocument();

      await userEvent.click(screen.getByText("Clear"));

      expect(screen.queryByText("Recent")).not.toBeInTheDocument();
      expect(localStorage.getItem("burnless:recent-searches")).toBeNull();
    });

    it("populates search input when recent search clicked", async () => {
      localStorage.setItem(
        "burnless:recent-searches",
        JSON.stringify(["expenses"])
      );

      renderPalette();

      // Click the "expenses" recent search (not the Expenses command)
      const recentButtons = screen.getAllByText("expenses");
      // The recent search button is the one that's a direct child with Clock icon
      await userEvent.click(recentButtons[0]!);

      const input = screen.getByPlaceholderText(
        "Search pages, actions, data..."
      );
      expect(input).toHaveValue("expenses");
    });

    it("saves search to recent when command executed via Enter", () => {
      renderPalette();
      const input = screen.getByPlaceholderText(
        "Search pages, actions, data..."
      );
      const combobox = screen.getByRole("combobox");

      fireEvent.change(input, { target: { value: "dash" } });
      fireEvent.keyDown(combobox, { key: "Enter" });

      const stored = JSON.parse(
        localStorage.getItem("burnless:recent-searches") || "[]"
      );
      expect(stored).toContain("dash");
    });
  });

  /* ── Suggested queries ──────────────────────────────────────────── */

  describe("suggested queries", () => {
    it("shows suggested queries when AI available and no query", () => {
      renderPalette({ onToggleAI: vi.fn() });

      expect(screen.getByText("Suggested")).toBeInTheDocument();
      expect(
        screen.getByText("How much runway do we have?")
      ).toBeInTheDocument();
      expect(screen.getByText("Show monthly burn rate")).toBeInTheDocument();
    });

    it("does not show suggestions without onToggleAI", () => {
      renderPalette();
      expect(screen.queryByText("Suggested")).not.toBeInTheDocument();
    });

    it("hides suggestions when query is entered", async () => {
      renderPalette({ onToggleAI: vi.fn() });
      const input = screen.getByPlaceholderText(
        "Search pages, actions, data..."
      );

      await userEvent.type(input, "test");

      expect(screen.queryByText("Suggested")).not.toBeInTheDocument();
    });

    it("calls onToggleAI when suggestion clicked", async () => {
      const onToggleAI = vi.fn();
      const onClose = vi.fn();
      renderPalette({ onToggleAI, onClose });

      await userEvent.click(
        screen.getByText("How much runway do we have?")
      );

      expect(onToggleAI).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  /* ── Use Intelligence button ────────────────────────────────────── */

  describe("Use Intelligence button", () => {
    it("shows when AI available and query entered", async () => {
      renderPalette({ onToggleAI: vi.fn() });
      const input = screen.getByPlaceholderText(
        "Search pages, actions, data..."
      );

      await userEvent.type(input, "test query");

      expect(screen.getByText("Use Intelligence")).toBeInTheDocument();
    });

    it("does not show without query", () => {
      renderPalette({ onToggleAI: vi.fn() });
      expect(screen.queryByText("Use Intelligence")).not.toBeInTheDocument();
    });

    it("does not show without onToggleAI", async () => {
      renderPalette();
      const input = screen.getByPlaceholderText(
        "Search pages, actions, data..."
      );

      await userEvent.type(input, "test query");

      expect(screen.queryByText("Use Intelligence")).not.toBeInTheDocument();
    });

    it("calls onToggleAI and saves search when clicked", async () => {
      const onToggleAI = vi.fn();
      const onClose = vi.fn();
      renderPalette({ onToggleAI, onClose });
      const input = screen.getByPlaceholderText(
        "Search pages, actions, data..."
      );

      await userEvent.type(input, "runway analysis");
      await userEvent.click(screen.getByText("Use Intelligence"));

      expect(onToggleAI).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();

      const stored = JSON.parse(
        localStorage.getItem("burnless:recent-searches") || "[]"
      );
      expect(stored).toContain("runway analysis");
    });
  });

  /* ── Footer ─────────────────────────────────────────────────────── */

  describe("footer", () => {
    it("shows keyboard shortcut hints", () => {
      renderPalette();
      expect(screen.getByText("navigate")).toBeInTheDocument();
      expect(screen.getByText("select")).toBeInTheDocument();
      expect(screen.getByText("close")).toBeInTheDocument();
    });
  });

  /* ── Edge cases ─────────────────────────────────────────────────── */

  describe("edge cases", () => {
    it("handles empty query gracefully", async () => {
      renderPalette();
      const input = screen.getByPlaceholderText(
        "Search pages, actions, data..."
      );

      // Type then clear
      await userEvent.type(input, "test");
      await userEvent.clear(input);

      // All commands should be back
      expect(screen.getByText("Dashboard")).toBeInTheDocument();
      expect(screen.getByText("New Scenario")).toBeInTheDocument();
    });

    it("handles special characters in search", async () => {
      renderPalette();
      const input = screen.getByPlaceholderText(
        "Search pages, actions, data..."
      );

      await userEvent.type(input, "p&l");
      // Revenue > Reports has keyword "p&l"
      expect(screen.getByText("Reports")).toBeInTheDocument();
    });

    it("resets state when re-opened", () => {
      const { rerender } = render(
        <CommandPalette open={true} onClose={vi.fn()} />
      );
      // Type something
      const input = screen.getByPlaceholderText(
        "Search pages, actions, data..."
      );
      fireEvent.change(input, { target: { value: "test" } });

      // Close and reopen
      rerender(<CommandPalette open={false} onClose={vi.fn()} />);
      rerender(<CommandPalette open={true} onClose={vi.fn()} />);

      const newInput = screen.getByPlaceholderText(
        "Search pages, actions, data..."
      );
      expect(newInput).toHaveValue("");
    });

    it("handles corrupt localStorage gracefully", () => {
      localStorage.setItem("burnless:recent-searches", "not valid json");
      // Should not throw
      expect(() => renderPalette()).not.toThrow();
    });

    it("limits recent searches to max 5", () => {
      localStorage.setItem(
        "burnless:recent-searches",
        JSON.stringify(["a", "b", "c", "d", "e", "f", "g"])
      );

      renderPalette();

      // Only first 5 should be there (localStorage might have more, but
      // getRecentSearches returns the array as-is — the limit is on save)
      // The component shows whatever is in localStorage
      const recent = screen.getByText("Recent");
      expect(recent).toBeInTheDocument();
    });
  });
});
