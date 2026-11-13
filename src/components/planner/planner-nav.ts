import { BarChart3, CalendarClock, CalendarDays, Clock, FolderKanban, History, ListChecks, Users, Webhook, type LucideIcon } from "lucide-react";

export type PlannerView = "calendar" | "tasks" | "projects" | "insights" | "calendars" | "team" | "hours" | "integrations" | "activity";

export type PlannerNavItem = { id: PlannerView; label: string; icon: LucideIcon; group: "plan" | "workspace"; description: string };

export const PLANNER_NAV: PlannerNavItem[] = [
  { id: "calendar", label: "Calendar", icon: CalendarDays, group: "plan", description: "Your week, planned around your meetings." },
  { id: "tasks", label: "Tasks", icon: ListChecks, group: "plan", description: "Everything on your plate, and where it landed in the plan." },
  { id: "projects", label: "Projects", icon: FolderKanban, group: "plan", description: "Progress and a forecast finish for every project." },
  { id: "insights", label: "Insights", icon: BarChart3, group: "plan", description: "How your plans hold up: hours, deadlines and estimates." },
  { id: "calendars", label: "Calendars", icon: CalendarClock, group: "workspace", description: "Meetings and busy time Planner works around." },
  { id: "team", label: "Team", icon: Users, group: "workspace", description: "Who plans here, their roles, capacity and focus hours." },
  { id: "hours", label: "Working hours", icon: Clock, group: "workspace", description: "When work can be planned, and how it is split into blocks." },
  { id: "integrations", label: "Webhooks", icon: Webhook, group: "workspace", description: "Tell your other tools when a plan changes." },
  { id: "activity", label: "History", icon: History, group: "workspace", description: "Every plan version and every change, newest first." },
];

export function isPlannerView(value: string | null | undefined): value is PlannerView {
  return PLANNER_NAV.some((item) => item.id === value);
}

export function navItem(view: PlannerView) {
  return PLANNER_NAV.find((item) => item.id === view) ?? PLANNER_NAV[0];
}
