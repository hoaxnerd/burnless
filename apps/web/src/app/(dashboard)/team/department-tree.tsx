"use client";
import type { Department } from "@burnless/types";

export interface DepartmentTreeNode extends Department {
  children: DepartmentTreeNode[];
}

/** Build a 3-level tree from a flat adjacency-list array of departments. */
export function buildDepartmentTree(depts: Department[]): DepartmentTreeNode[] {
  const byId = new Map<string, DepartmentTreeNode>();
  for (const d of depts) byId.set(d.id, { ...d, children: [] });
  const roots: DepartmentTreeNode[] = [];
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

interface DepartmentTreeProps {
  departments: Department[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onAddChild?: (parentId: string | null, level: 1 | 2 | 3) => void;
}

export function DepartmentTree({ departments, selectedId, onSelect, onAddChild }: DepartmentTreeProps) {
  const roots = buildDepartmentTree(departments);

  return (
    <div className="department-tree" data-testid="department-tree">
      <ul className="root-list">
        {roots.map((org) => (
          <li key={org.id} data-level="1" className="tree-node tree-node--level-1">
            <button
              type="button"
              className={selectedId === org.id ? "selected" : ""}
              onClick={() => onSelect?.(org.id)}
              data-testid={`dept-${org.id}`}
            >
              {org.name}
            </button>
            {org.children.length > 0 && (
              <ul className="sub-list">
                {org.children.map((sub) => (
                  <li key={sub.id} data-level="2" className="tree-node tree-node--level-2">
                    <button
                      type="button"
                      className={selectedId === sub.id ? "selected" : ""}
                      onClick={() => onSelect?.(sub.id)}
                      data-testid={`dept-${sub.id}`}
                    >
                      {sub.name}
                    </button>
                    {sub.children.length > 0 && (
                      <ul className="team-list">
                        {sub.children.map((team) => (
                          <li key={team.id} data-level="3" className="tree-node tree-node--level-3">
                            <button
                              type="button"
                              className={selectedId === team.id ? "selected" : ""}
                              onClick={() => onSelect?.(team.id)}
                              data-testid={`dept-${team.id}`}
                            >
                              {team.name}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {onAddChild && (
                      <button
                        type="button"
                        className="add-team"
                        onClick={() => onAddChild(sub.id, 3)}
                        data-testid={`add-team-${sub.id}`}
                      >
                        + Add team
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {onAddChild && (
              <button
                type="button"
                className="add-sub"
                onClick={() => onAddChild(org.id, 2)}
                data-testid={`add-sub-${org.id}`}
              >
                + Add sub-department
              </button>
            )}
          </li>
        ))}
      </ul>
      {onAddChild && (
        <button
          type="button"
          className="add-org"
          onClick={() => onAddChild(null, 1)}
          data-testid="add-org"
        >
          + Add organization
        </button>
      )}
    </div>
  );
}
