"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { MonitorIcon, MoonIcon, SunIcon } from "@/components/nav-icons";
import type { ThemeChoice } from "@/lib/preferences/boot";

const CHOICES: { id: ThemeChoice; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "system", label: "System" },
];

export function ThemeMenu({ choice, onChange }: { choice: ThemeChoice; onChange: (choice: ThemeChoice) => void }) {
  const [open, setOpen] = useState(false);
  const [flip, setFlip] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const popoverId = useId();

  useEffect(() => {
    if (!open) return;
    const selected = popoverRef.current?.querySelector<HTMLInputElement>("input:checked");
    selected?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (popoverRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  function toggle() {
    const rect = triggerRef.current?.getBoundingClientRect();
    setFlip(Boolean(rect && rect.bottom > window.innerHeight - 160));
    setOpen((current) => !current);
  }

  function close(restore: boolean) {
    setOpen(false);
    if (restore) triggerRef.current?.focus();
  }

  function select(next: ThemeChoice) {
    onChange(next);
    close(true);
  }

  return (
    <div className="theme-menu">
      <button
        ref={triggerRef}
        type="button"
        className="btn hit"
        aria-label="Theme"
        aria-expanded={open}
        aria-controls={popoverId}
        onClick={toggle}
      >
        <ThemeIcon choice={choice} />
      </button>
      <div
        ref={popoverRef}
        id={popoverId}
        hidden={!open}
        className={`theme-popover ${flip ? "tip-flip" : ""}`}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            close(true);
            return;
          }
          if (event.key === "Tab") trapTab(event, popoverRef.current);
        }}
      >
        <ThemeOptions choice={choice} name="theme-header" onChange={select} />
      </div>
    </div>
  );
}

export function ThemeOptions({
  choice,
  onChange,
  name,
}: {
  choice: ThemeChoice;
  onChange: (choice: ThemeChoice) => void;
  name: string;
}) {
  return (
    <div role="radiogroup" aria-label="Appearance" className="theme-options" onKeyDown={(event) => moveRadio(event, choice, onChange)}>
      {CHOICES.map((option) => (
        <label key={option.id} className="theme-option type-control">
          <input
            className="sr-only"
            type="radio"
            name={name}
            value={option.id}
            checked={choice === option.id}
            onChange={() => onChange(option.id)}
          />
          <ThemeIcon choice={option.id} />
          {option.label}
        </label>
      ))}
    </div>
  );
}

function ThemeIcon({ choice }: { choice: ThemeChoice }) {
  if (choice === "system") return <MonitorIcon />;
  if (choice === "dark") return <MoonIcon />;
  return <SunIcon />;
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
