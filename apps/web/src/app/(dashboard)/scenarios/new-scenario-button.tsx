"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui";
import { CreateScenarioModal } from "@/components/scenarios/create-scenario-modal";
import { useScenario } from "@/components/scenarios/scenario-context";

export function NewScenarioButton() {
  const { enterScenario } = useScenario();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="primary"
        icon={<Plus className="h-4 w-4" />}
        onClick={() => setOpen(true)}
      >
        New Scenario
      </Button>
      <CreateScenarioModal
        open={open}
        onClose={() => setOpen(false)}
        onCreated={(scenario) => {
          // Activate the freshly-created scenario (enter its sandbox) so it
          // shows instantly with the active banner. There is no /scenarios/[id]
          // detail route — pushing there 404s; the overlay model activates via
          // the active-scenario cookie + a refresh instead.
          enterScenario(scenario.id, scenario.name);
        }}
      />
    </>
  );
}
