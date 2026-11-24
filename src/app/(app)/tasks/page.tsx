import type { Metadata } from "next";
import { TaskManager } from "@/components/tasks/task-manager";

export const metadata: Metadata = { title: "Công việc" };

export default function TasksPage() {
  return <TaskManager />;
}
