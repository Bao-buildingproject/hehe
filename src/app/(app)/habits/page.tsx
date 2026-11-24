import type { Metadata } from "next";
import { HabitsView } from "@/components/habits/habits-view";

// Data loads in the browser after the app shell; see the (app) layout.
export const instant = false;

export const metadata: Metadata = { title: "Thói quen" };

export default function HabitsPage() {
  return <HabitsView />;
}
