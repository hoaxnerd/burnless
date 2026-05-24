"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui";
import { CreateScenarioModal } from "@/components/scenarios/create-scenario-modal";

export function NewScenarioButton() {
  const router = useRouter();
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
          router.push(`/scenarios/${scenario.id}`);
        }}
      />
    </>
  );
}
