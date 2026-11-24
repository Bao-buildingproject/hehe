import type { Metadata } from "next";
import { SettingsView } from "@/components/settings/settings-view";

// Data loads in the browser after the app shell; see the (app) layout.
export const instant = false;

export const metadata: Metadata = { title: "Cài đặt" };

export default function SettingsPage() {
  return <SettingsView />;
}
