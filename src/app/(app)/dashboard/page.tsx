import type { Metadata } from "next";
import { DashboardView } from "@/components/dashboard/dashboard-view";

// Data loads in the browser after the app shell; see the (app) layout.
export const instant = false;

export const metadata: Metadata = { title: "Thống kê" };

export default function DashboardPage() {
  return <DashboardView />;
}
