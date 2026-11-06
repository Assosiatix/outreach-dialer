export const STAGES = [
  { value: "new", label: "New" },
  { value: "researched", label: "Researched" },
  { value: "contacted", label: "Contacted" },
  { value: "follow_up", label: "Follow-up" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
] as const;

export type StageValue = (typeof STAGES)[number]["value"];

export function stageLabel(v: string) {
  return STAGES.find((s) => s.value === v)?.label ?? v;
}

export function stageTone(v: string): "neutral" | "positive" | "coral" | "dark" | "outline" {
  switch (v) {
    case "won":
      return "positive";
    case "lost":
      return "coral";
    case "follow_up":
      return "dark";
    case "new":
      return "outline";
    default:
      return "neutral";
  }
}
