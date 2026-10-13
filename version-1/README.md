# version-1

The archive. It holds the project's first version, and the AI-generated documents that came out of building the current one. Nothing here is used by the live app.

## legacy-html/

The **Review 1** prototype, plain HTML, CSS and JavaScript:

- `index.html`: login / role selection
- `student.html`: complaint form
- `warden.html`: warden view
- `script.js`, `style.css`, `images/`

Open `legacy-html/index.html` in a browser to try it. It has no backend: complaints only lived in the page and disappeared on refresh. The current app (React + Express + MongoDB) replaced it. See the root `ARCHITECTURE.md`.

## ai-docs/

Documents written with Claude Code while building and auditing the current app:

| File | What it is |
|---|---|
| `CLAUDE.md` | The project instructions Claude Code follows (architecture rules, conventions, status). The one-line root `CLAUDE.md` imports it, so Claude still loads it automatically. |
| `check.md` | Every review and audit pass, item by item, with what's fixed and what's still open |
| `PROJECT_REVIEW.md` | Scored review (code, security, testing, deployment…), release blockers, interview questions and what to be able to explain |
| `claude-memory/` | Snapshot (2026-10-14) of Claude's memory notes about the deployment and lessons learned. The database cluster address is redacted. |

Paths written inside these files are relative to the **repo root**.
