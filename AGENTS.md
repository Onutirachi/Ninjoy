# Ninjoy — Agent Guide

Ninjoy is a desktop host (Windows and Linux) that creates virtual game controllers and serves a
browser-based touch controller to phones and tablets on the same local network. Read
[the constitution](.specify/memory/constitution.md) before doing anything: it defines the
principles, scope and workflow, and it overrides this guide.

## Starting a session

1. Read the constitution.
2. Find the spec you are working on in `specs/<timestamp>-<slug>/` (the branch name
   `feat/<timestamp>-<slug>` points to it).
3. Read its `handoff.md` first, then `spec.md`, `plan.md` and `tasks.md` as needed. Do not read
   other specs unless the handoff says so.
4. At the end of the session, update `handoff.md` (template:
   `.specify/templates/handoff-template.md`).

## Rules that are easy to break

- **No code before the spec is approved** by the maintainer. Ask for explicit confirmation
  before writing any implementation code.
- **Never commit without the maintainer validating the change.** Show what changed, let the
  maintainer test it, and iterate until it is approved; only then commit. A prompt asking for an
  adjustment is part of the iteration, not a reason for a new commit.
- **Push each approved commit** to its branch right away, so nothing lives only on one machine.
- A correction to a commit that is not merged yet is folded into it (amend or fixup) and the
  branch is updated with `git push --force-with-lease`. Never add a "fix" commit for it, never
  revert it, never use a plain `--force`.
- **`main` is never rewritten.** A problem found after a merge gets a normal `fix` commit.
- Conventional Commits. **No `Co-Authored-By` or any AI attribution trailer.**
- Everything in the repository is in English. Talk to the maintainer in the language they
  use (currently Portuguese).
- If a decision changes during implementation, update the spec before the code.
- Experiments stay on their own branch; their code is not merged unless a spec adopts it.

## Pull requests

The maintainer relies on the agent to say when it is time:

- When a spec is done (all tasks implemented and validated), ask: "the spec is finished — open
  the pull request and merge it?"
- On a yes: open the pull request, wait for CI to pass, and merge it with **rebase** so `main`
  stays linear (no merge commits).
- Other work (`fix/`, `docs/`, `chore/` branches) follows the same path once validated.

## Spec workflow (Spec Kit)

| Step | Skill | Output |
|---|---|---|
| Create the spec and its branch | `/speckit-specify` | `spec.md`, branch `feat/<timestamp>-<slug>` |
| Resolve open questions | `/speckit-clarify` | updated `spec.md` |
| Technical design | `/speckit-plan` | `plan.md` (+ research, data model, contracts) |
| Break into tasks | `/speckit-tasks` | `tasks.md` |
| Check consistency | `/speckit-analyze` | report |
| Implement (only after approval) | `/speckit-implement` | code |

Spec Kit auto-commit hooks are disabled on purpose; commits happen only after validation.
