import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DepartmentTree, buildDepartmentTree } from "../department-tree";
import type { Department } from "@burnless/types";

function makeDept(partial: Partial<Department> & { id: string; name: string }): Department {
  return {
    id: partial.id,
    companyId: partial.companyId ?? "c",
    name: partial.name,
    parentId: partial.parentId ?? null,
    createdAt: partial.createdAt ?? new Date(),
    updatedAt: partial.updatedAt ?? new Date(),
  };
}

describe("buildDepartmentTree", () => {
  it("builds a 3-level tree from flat list", () => {
    const flat: Department[] = [
      makeDept({ id: "org", name: "Engineering", parentId: null }),
      makeDept({ id: "sub", name: "Backend", parentId: "org" }),
      makeDept({ id: "team", name: "Platform", parentId: "sub" }),
    ];
    const tree = buildDepartmentTree(flat);
    expect(tree).toHaveLength(1);
    const root = tree[0]!;
    expect(root.id).toBe("org");
    expect(root.children).toHaveLength(1);
    const sub = root.children[0]!;
    expect(sub.id).toBe("sub");
    expect(sub.children).toHaveLength(1);
    expect(sub.children[0]!.id).toBe("team");
  });

  it("returns roots when parentId points to non-existent dept", () => {
    const flat: Department[] = [
      makeDept({ id: "a", name: "Orphan", parentId: "missing" }),
    ];
    const tree = buildDepartmentTree(flat);
    expect(tree).toHaveLength(1);
    expect(tree[0]!.id).toBe("a");
  });

  it("handles multiple roots and siblings", () => {
    const flat: Department[] = [
      makeDept({ id: "org-a", name: "Eng", parentId: null }),
      makeDept({ id: "org-b", name: "GTM", parentId: null }),
      makeDept({ id: "sub-a1", name: "BE", parentId: "org-a" }),
      makeDept({ id: "sub-a2", name: "FE", parentId: "org-a" }),
    ];
    const tree = buildDepartmentTree(flat);
    expect(tree).toHaveLength(2);
    const eng = tree.find((n) => n.id === "org-a")!;
    expect(eng.children).toHaveLength(2);
  });
});

describe("DepartmentTree component", () => {
  const flat: Department[] = [
    makeDept({ id: "org", name: "Eng", parentId: null }),
    makeDept({ id: "sub", name: "BE", parentId: "org" }),
    makeDept({ id: "team", name: "Platform", parentId: "sub" }),
  ];

  it("renders 3 levels with data-level attrs", () => {
    const { container } = render(<DepartmentTree departments={flat} />);
    expect(container.querySelector('[data-level="1"]')).toBeTruthy();
    expect(container.querySelector('[data-level="2"]')).toBeTruthy();
    expect(container.querySelector('[data-level="3"]')).toBeTruthy();
  });

  it("renders department names at each level", () => {
    render(<DepartmentTree departments={flat} />);
    expect(screen.getByText("Eng")).toBeTruthy();
    expect(screen.getByText("BE")).toBeTruthy();
    expect(screen.getByText("Platform")).toBeTruthy();
  });

  it("invokes onSelect with department id when clicked", () => {
    const onSelect = vi.fn();
    render(<DepartmentTree departments={flat} onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId("dept-sub"));
    expect(onSelect).toHaveBeenCalledWith("sub");
  });

  it("marks selected node with selected class", () => {
    render(<DepartmentTree departments={flat} selectedId="team" />);
    const btn = screen.getByTestId("dept-team");
    expect(btn.className).toContain("selected");
  });

  it("renders add-child buttons at appropriate levels when onAddChild provided", () => {
    const onAddChild = vi.fn();
    render(<DepartmentTree departments={flat} onAddChild={onAddChild} />);
    expect(screen.getByTestId("add-org")).toBeTruthy();
    expect(screen.getByTestId("add-sub-org")).toBeTruthy();
    expect(screen.getByTestId("add-team-sub")).toBeTruthy();
  });

  it("invokes onAddChild with correct level argument", () => {
    const onAddChild = vi.fn();
    render(<DepartmentTree departments={flat} onAddChild={onAddChild} />);
    fireEvent.click(screen.getByTestId("add-org"));
    expect(onAddChild).toHaveBeenCalledWith(null, 1);
    fireEvent.click(screen.getByTestId("add-sub-org"));
    expect(onAddChild).toHaveBeenCalledWith("org", 2);
    fireEvent.click(screen.getByTestId("add-team-sub"));
    expect(onAddChild).toHaveBeenCalledWith("sub", 3);
  });

  it("does not render add-child buttons when onAddChild is not provided", () => {
    render(<DepartmentTree departments={flat} />);
    expect(screen.queryByTestId("add-org")).toBeNull();
  });
});
