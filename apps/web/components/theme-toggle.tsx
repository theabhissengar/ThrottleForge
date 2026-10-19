"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { MonitorIcon, MoonIcon, SunIcon } from "@/components/nav-icons";
import type { ThemeChoice } from "@/lib/preferences/boot";

const CHOICES: { id: ThemeChoice; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "system", label: "System" },
];

export function ThemeToggle({
  variant,
  choice,
  onChange,
  name = "theme-segmented",
}: {
  variant: "segmented" | "popover";
  choice: ThemeChoice;
  onChange: (choice: ThemeChoice) => void;
  name?: string;
}) {
  if (variant === "segmented") {
    return <Segmented choice={choice} onChange={onChange} name={name} />;
  }
  return <PopoverTheme choice={choice} onChange={onChange} />;
}

function Segmented({
  choice,
  onChange,
  name,
}: {
  choice: ThemeChoice;
  onChange: (choice: ThemeChoice) => void;
  name: string;
}) {
  return (
    <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-1" onKeyDown={(event) => moveRadio(event, choice, onChange)}>
      {CHOICES.map((option) => (
        <label key={option.id} className={`type-control flex min-h-10 cursor-pointer items-center justify-center rounded-[var(--radius-control)] ${choice === option.id ? "bg-selected text-ink" : "text-ink-dim"}`}>
          <input
            className="sr-only"
            type="radio"
            name={name}
            value={option.id}
            checked={choice === option.id}
            onChange={() => onChange(option.id)}
          />
          {option.label}
        </label>
      ))}
    </div>
  );
}

function PopoverTheme({ choice, onChange }: { choice: ThemeChoice; onChange: (choice: ThemeChoice) => void }) {
  const [open, setOpen] = useState(false);
  const [flip, setFlip] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const popoverId = useId();
  const resolved = documentThemeLabel(choice);

  useEffect(() => {
    if (!open) return;
    const selected = popoverRef.current?.querySelector<HTMLInputElement>("input:checked");
    selected?.focus();
  }, [open]);

  function toggle() {
    const rect = triggerRef.current?.getBoundingClientRect();
    setFlip(Boolean(rect && rect.bottom > window.innerHeight - 160));
    setOpen((current) => !current);
  }

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        className="btn hit has-tip"
        aria-label="Theme"
        aria-expanded={open}
        aria-controls={popoverId}
        onClick={toggle}
        onMouseEnter={markTip}
        onFocus={markTip}
      >
        <ThemeIcon choice={choice} />
        <span className="rail-tip" aria-hidden="true">
          Theme, {resolved}
        </span>
      </button>
      <div
        ref={popoverRef}
        id={popoverId}
        hidden={!open}
        className={`theme-popover ${flip ? "tip-flip" : ""}`}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            close();
            return;
          }
          if (event.key === "Tab") trapTab(event, popoverRef.current);
        }}
      >
        <Segmented
          choice={choice}
          name="theme-popover"
          onChange={(next) => {
            onChange(next);
          }}
        />
      </div>
    </div>
  );
}

function ThemeIcon({ choice }: { choice: ThemeChoice }) {
  if (choice === "system") return <MonitorIcon />;
  if (choice === "dark") return <MoonIcon />;
  return <SunIcon />;
}

function documentThemeLabel(choice: ThemeChoice): string {
  if (choice === "light") return "Light";
  if (choice === "dark") return "Dark";
  return "System";
}

function moveRadio(event: KeyboardEvent<HTMLElement>, choice: ThemeChoice, onChange: (choice: ThemeChoice) => void) {
  const index = CHOICES.findIndex((option) => option.id === choice);
  let next = choice;
  if (event.key === "ArrowRight" || event.key === "ArrowDown") {
    event.preventDefault();
    next = CHOICES[(index + 1) % CHOICES.length].id;
  } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
    event.preventDefault();
    next = CHOICES[(index + CHOICES.length - 1) % CHOICES.length].id;
  } else {
    return;
  }
  onChange(next);
  event.currentTarget.querySelector<HTMLInputElement>(`input[value="${next}"]`)?.focus();
}

function trapTab(event: KeyboardEvent<HTMLElement>, root: HTMLElement | null) {
  if (!root) return;
  const items = Array.from(root.querySelectorAll<HTMLElement>("input, button"));
  if (items.length === 0) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export function markTip(event: { currentTarget: HTMLElement }) {
  const rect = event.currentTarget.getBoundingClientRect();
  event.currentTarget.classList.toggle("tip-flip", rect.bottom > window.innerHeight - 160);
}

export function themeAnnouncement(before: string | undefined, after: string): string {
  if (before === after) return "";
  return after === "dark" ? "Dark theme" : "Light theme";
}
