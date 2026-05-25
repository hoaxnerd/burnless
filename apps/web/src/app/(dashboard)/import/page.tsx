import { getCompany } from "@/lib/data";
import { companyCurrency } from "@/lib/server-currency";
import { ImportFlow } from "./import-flow";
import { SetupPrompt } from "@/components/ui/empty-state";

export default async function ImportPage() {
  const company = await getCompany();
  if (!company) return <SetupPrompt context="importing data" />;

  return <ImportFlow currency={companyCurrency(company)} />;
}
