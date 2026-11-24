import type { Metadata } from "next";
import { CalendarView } from "@/components/calendar/calendar-view";

// Data loads in the browser after the app shell; see the (app) layout.
export const instant = false;

export const metadata: Metadata = { title: "Lịch" };

export default function CalendarPage() {
  return <CalendarView />;
}
