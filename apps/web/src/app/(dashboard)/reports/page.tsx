import { redirect } from "next/navigation";

export default function ReportsPage() {
  redirect("/data-room?tab=reports");
}
