import type { Metadata } from "next";
import { TaskManager } from "@/components/tasks/task-manager";

// Data loads in the browser after the app shell; see the (app) layout.
export const instant = false;

export const metadata: Metadata = { title: "Công việc" };

export default function TasksPage() {
  return <TaskManager />;
}
