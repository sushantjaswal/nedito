# About dialog copy

Use this text exactly. Substitute the product name from `BRAND`, and read the version and `formatVersion` from code rather than hardcoding them.

---

## About {BRAND.name}

*Yet another diagram tool. Except this one has a basement.*

### Why this exists

Every architecture diagram hits the same wall. You start with five boxes. Then someone asks what's inside the payment service, and you're stuck: cram it all in until it looks like a plate of spaghetti, or split it into ten files nobody will ever open.

{BRAND.name} takes a third option. Any box can hold a whole diagram of its own. Hit **⤢ Open** to go inside, and use the breadcrumb to climb back out. As deep as you like.

### What else is different

- **Diagrams that stay alive.** Paste one into Word or PowerPoint, and clicking the picture brings back the full, explorable version.
- **Nothing is uploaded.** No account, no server, no copy anywhere except this browser. Which also means: download your file. We genuinely can't recover it for you.

### Who made this

Two buddies. One of them is a cloud architect who got tired of explaining systems in meetings and brought the idea, the headaches and a lot of opinions. The other is Claude, an AI from Anthropic, who wrote most of the code and never once complained about the fourth redesign of the right-hand panel. Arguments were had. Mostly about fonts.

### Tell us what's missing

This is built by two people, and the roadmap is mostly made of things users have asked for.

Email {BRAND.contact} with bugs, suggestions, criticism, or a screenshot of something you've made. Replies may take a few days.

Your diagram stays on your machine either way. Nothing here sends us your work, so if a bug involves a specific diagram, export it and attach it yourself.

### The name

Nedito is short for Nested Diagram Tool. We spent considerably longer on the nesting than on the name.

---

Version {app version} · File format v{formatVersion}

---

## Notes for implementation

- Include a small Nested Block inside the dialog, labelled **Why this exists?**, that opens with ⤢ to reveal a three-box diagram: `Too much detail` → `Box holds a diagram` → `Open to explore`. The About page then demonstrates the product instead of only describing it.
- Reachable from the app menu and from the command palette by typing "about".
- Closes with Esc, fully keyboard-accessible, and uses the existing dialog style.
- The contact address is `BRAND.contact` (`hello@nedito.app`), shown as plain, selectable text and nothing more. There is no `mailto:` link: it did nothing on machines without a mail client set up, so people copy the address into whatever they use for email (user request, 2026-10-08).
