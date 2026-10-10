// About (N4, CLAUDE_HISTORY.md D103), from the app menu and the palette ("about"). The words are
// docs/about-copy.md's, exactly (AboutDialog.test.tsx holds them to it); the name comes from
// BRAND, the version from package.json and the file format's version from the format code — none
// of them written out here. The contact address is BRAND.contact, shown as text to copy — no
// mailto: link, which did nothing where no mail client is set up.
//
// It shows the product rather than only describing it: a small Nested Block, "Why this exists?",
// opens with ⤢ into its own three-box diagram, with a breadcrumb back out — and Esc goes back out
// first, as it does on the canvas, before it closes the dialog.
import { useEffect, useRef, useState } from "react";
import { CURRENT_FORMAT_VERSION } from "../file/documentFormat";
import { useDocStore } from "../model/store";
import { BRAND } from "./brand";
import styles from "./AboutDialog.module.css";
import { APP_VERSION } from "./version";

const DEMO_NAME = "Why this exists?";
const DEMO_STEPS = ["Too much detail", "Box holds a diagram", "Open to explore"];

export function AboutDialog() {
  const open = useDocStore((s) => s.ui.aboutOpen);
  const setOpen = useDocStore((s) => s.setAboutOpen);
  const [inside, setInside] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openRef = useRef<HTMLButtonElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  // Where focus goes after the next open or close of the demo; null on the dialog's first render.
  const focusAfter = useRef<"open" | "back" | null>(null);

  useEffect(() => {
    if (!open) return;
    setInside(false);
    const back = document.activeElement as HTMLElement | null;
    requestAnimationFrame(() => closeRef.current?.focus());
    return () => back?.focus?.();
  }, [open]);

  useEffect(() => {
    if (focusAfter.current === "back") backRef.current?.focus();
    if (focusAfter.current === "open") openRef.current?.focus();
    focusAfter.current = null;
  }, [inside]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (inside) {
          focusAfter.current = "open";
          setInside(false);
        } else {
          setOpen(false);
        }
        return;
      }
      // Keep Tab inside the dialog while it is open.
      if (e.key === "Tab" && dialogRef.current) {
        const items = [...dialogRef.current.querySelectorAll<HTMLElement>("button, [href], [tabindex]:not([tabindex='-1'])")];
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        } else if (!dialogRef.current.contains(document.activeElement)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, inside, setOpen]);

  if (!open) return null;

  const goInside = () => {
    focusAfter.current = "back";
    setInside(true);
  };
  const goBack = () => {
    focusAfter.current = "open";
    setInside(false);
  };

  return (
    <div className={styles.overlay} onPointerDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="nd-about-title"
        data-testid="nd-about-dialog"
      >
        <div className={styles.header}>
          <h2 id="nd-about-title" className={styles.title}>
            About {BRAND.name}
          </h2>
          <button ref={closeRef} type="button" className={styles.close} onClick={() => setOpen(false)} aria-label="Close" data-testid="nd-about-close">
            ×
          </button>
        </div>

        <div className={styles.body}>
          <p className={styles.tagline}>
            <em>Yet another diagram tool. Except this one has a basement.</em>
          </p>

          <h3 className={styles.heading}>Why this exists</h3>
          <p>
            Every architecture diagram hits the same wall. You start with five boxes. Then someone asks what's inside the
            payment service, and you're stuck: cram it all in until it looks like a plate of spaghetti, or split it into ten
            files nobody will ever open.
          </p>
          <p>
            {BRAND.name} takes a third option. Any box can hold a whole diagram of its own. Hit <strong className={styles.nowrap}>⤢ Open</strong> to go
            inside, and use the breadcrumb to climb back out. As deep as you like.
          </p>

          <div className={styles.demo} data-testid="nd-about-demo">
            {inside ? (
              <div className={styles.inside} data-testid="nd-about-demo-inside">
                <nav className={styles.crumbs} aria-label="Breadcrumb">
                  <button ref={backRef} type="button" className={styles.crumb} onClick={goBack} data-testid="nd-about-demo-back">
                    About
                  </button>
                  <span className={styles.crumbSep} aria-hidden="true">
                    ›
                  </span>
                  <span className={styles.crumbHere} aria-current="location">
                    {DEMO_NAME}
                  </span>
                </nav>
                <ol className={styles.flow} aria-label={`${DEMO_NAME}: ${DEMO_STEPS.join(", then ")}`}>
                  {DEMO_STEPS.map((step, i) => (
                    <li key={step} className={styles.step}>
                      {i > 0 && (
                        <svg className={styles.arrow} viewBox="0 0 28 12" aria-hidden="true">
                          <path d="M1 6H26M20 1.5L26 6L20 10.5" />
                        </svg>
                      )}
                      <span className={styles.box}>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : (
              <div className={styles.nested}>
                <span className={styles.ghost2} aria-hidden="true" />
                <span className={styles.ghost1} aria-hidden="true" />
                <div className={styles.nestedBody}>
                  <div className={styles.nestedHeader}>
                    <span className={styles.badge} aria-hidden="true">
                      ⧉
                    </span>
                    <span className={styles.nestedName}>{DEMO_NAME}</span>
                    <button
                      ref={openRef}
                      type="button"
                      className={styles.openBtn}
                      onClick={goInside}
                      aria-label={`Open ${DEMO_NAME}`}
                      title="Open child diagram"
                      data-testid="nd-about-demo-open"
                    >
                      ⤢
                    </button>
                  </div>
                  {/* The live miniature a Nested Block shows of what is inside it. */}
                  <svg className={styles.miniature} viewBox="0 0 120 22" aria-hidden="true">
                    <rect x="1" y="5" width="30" height="12" rx="2" />
                    <rect x="45" y="5" width="30" height="12" rx="2" />
                    <rect x="89" y="5" width="30" height="12" rx="2" />
                    <path d="M31 11H45M75 11H89" />
                  </svg>
                </div>
              </div>
            )}
          </div>

          <h3 className={styles.heading}>What else is different</h3>
          <ul className={styles.list}>
            <li>
              <strong>Diagrams that stay alive.</strong> Paste one into Word or PowerPoint, and clicking the picture brings back
              the full, explorable version.
            </li>
            <li>
              <strong>Nothing is uploaded.</strong> No account, no server, no copy anywhere except this browser. Which also
              means: download your file. We genuinely can't recover it for you.
            </li>
          </ul>

          <h3 className={styles.heading}>Who made this</h3>
          <p>
            Two buddies. One of them is a cloud architect who got tired of explaining systems in meetings and brought the idea,
            the headaches and a lot of opinions. The other is Claude, an AI from Anthropic, who wrote most of the code and never
            once complained about the fourth redesign of the right-hand panel. Arguments were had. Mostly about fonts.
          </p>

          <h3 className={styles.heading}>Tell us what&apos;s missing</h3>
          <p>This is built by two people, and the roadmap is mostly made of things users have asked for.</p>
          <p>
            {/* Plain text anyone can select and copy into their own mail (one click selects it all). */}
            Email <span className={styles.address} data-testid="nd-about-contact">{BRAND.contact}</span> with bugs, suggestions,
            criticism, or a screenshot of something you&apos;ve made. Replies may take a few days.
          </p>
          <p>
            Your diagram stays on your machine either way. Nothing here sends us your work, so if a bug involves a specific
            diagram, export it and attach it yourself.
          </p>

          <h3 className={styles.heading}>The name</h3>
          <p>
            {BRAND.name} is short for Nested Diagram Tool. We spent considerably longer on the nesting than on the name.
          </p>
        </div>

        <div className={styles.footer} data-testid="nd-about-version">
          Version {APP_VERSION} · File format v{CURRENT_FORMAT_VERSION}
        </div>
      </div>
    </div>
  );
}
