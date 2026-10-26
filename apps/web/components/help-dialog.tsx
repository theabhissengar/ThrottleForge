"use client";

import { createContext, useContext, useId, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { HELP_TOPICS, helpTopic, topicForPath } from "@/lib/help/topics";

type HelpApi = {
  open: (id?: string) => void;
};

const HelpContext = createContext<HelpApi | null>(null);

export function useHelp(): HelpApi {
  const value = useContext(HelpContext);
  if (!value) throw new Error("useHelp must be used inside HelpProvider");
  return value;
}

export function HelpProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const [topicId, setTopicId] = useState("overview");
  const topic = helpTopic(topicId);

  function open(id?: string) {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const next = id ?? topicForPath(pathname);
    setTopicId(next);
    dialogRef.current?.showModal();
    requestAnimationFrame(() => {
      const body = dialogRef.current?.querySelector<HTMLElement>(".help-dialog-body");
      const node = document.getElementById(`help-${next}`);
      if (!body || !node) return;
      const top = node.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop;
      body.scrollTop = Math.max(0, top);
    });
  }

  function close() {
    dialogRef.current?.close();
    openerRef.current?.focus();
  }

  return (
    <HelpContext.Provider value={{ open }}>
      {children}
      <dialog
        ref={dialogRef}
        className="help-dialog"
        aria-labelledby={titleId}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          close();
        }}
        onClose={() => openerRef.current?.focus()}
      >
        <div className="help-dialog-bar">
          <h2 id={titleId} className="type-section">
            {topic.title}
          </h2>
          <button type="button" className="btn" onClick={close}>
            Close
          </button>
        </div>
        <div className="help-dialog-body">
          <div className="grid gap-4">
            {topic.sections.map((section) => (
              <section key={section.heading} id={section.heading === topic.sections[0]?.heading ? `help-${topic.id}` : undefined}>
                <h3 className="type-card">{section.heading}</h3>
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph} className="type-body mt-2 text-ink-dim">
                    {paragraph}
                  </p>
                ))}
              </section>
            ))}
          </div>
          <p className="type-secondary mt-4">
            <a className="text-link" href={`/docs#${topic.id}`}>
              Open full page
            </a>
          </p>
        </div>
      </dialog>
    </HelpContext.Provider>
  );
}

export function DocsIndex() {
  return (
    <div className="page-stack">
      <header>
        <h1 className="type-display">Documentation</h1>
        <p className="type-body mt-2 text-ink-dim">
          Plain-language notes for each page. Most of them describe what you can see on the screen. The load commands run in a terminal on your own computer, and this page does not start them.
        </p>
      </header>
      <nav aria-label="Documentation topics" className="card">
        <ul className="grid gap-2 sm:grid-cols-2">
          {HELP_TOPICS.map((topic) => (
            <li key={topic.id}>
              <a className="text-link type-control" href={`#${topic.id}`}>
                {topic.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      {HELP_TOPICS.map((topic) => (
        <section key={topic.id} id={topic.id} className="card docs-topic grid gap-3">
          <h2 className="type-section">{topic.title}</h2>
          {topic.sections.map((section) => (
            <div key={section.heading}>
              <h3 className="type-card">{section.heading}</h3>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph} className="type-body mt-2 text-ink-dim">
                  {paragraph}
                </p>
              ))}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
