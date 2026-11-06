"use client";

import { useState } from "react";
import { cx } from "../ui";

/** value: undefined = unchanged, null = clear, ISO string = set. */
export function FollowUpPicker({
  value,
  onChange,
}: {
  value: string | null | undefined;
  onChange: (v: string | null | undefined) => void;
}) {
  const [custom, setCustom] = useState("");
  const at = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(10, 0, 0, 0);
    return d.toISOString();
  };
  const presets = [
    { label: "Tomorrow", v: at(1) },
    { label: "3 days", v: at(3) },
    { label: "1 week", v: at(7) },
  ];
  const chosenPreset = presets.find((p) => p.v === value)?.label;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {presets.map((p) => (
          <button
            type="button"
            key={p.label}
            onClick={() => {
              setCustom("");
              onChange(p.v);
            }}
            className={cx(
              "h-8 rounded-full border px-3 text-[13px]",
              chosenPreset === p.label ? "border-black bg-black text-white" : "border-line-strong hover:border-black",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      <input
        type="datetime-local"
        className="field"
        aria-label="Custom follow-up date"
        value={custom}
        onChange={(e) => {
          setCustom(e.target.value);
          onChange(e.target.value ? new Date(e.target.value).toISOString() : undefined);
        }}
      />
    </div>
  );
}
