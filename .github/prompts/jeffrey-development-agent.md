# Jeffrey PWA isolated change task

Read `.jeffrey-development-task.json` for the customer's approved, structured change request. Implement only that request in this repository.

Rules:

- Preserve the existing Jeffrey chat, private-user authentication, PWA behavior, OpenAI/Supabase/Obsidian architecture, DeepSeek preview, and fox identity unless the task explicitly changes a relevant visible detail.
- Never read or edit `.env*`, private keys, customer knowledge exports, production data, deployment configuration, or `.github/workflows/`.
- Do not add arbitrary shell execution to chat routes or expose secrets to the browser.
- Keep the change focused. Add or update behavior tests where appropriate.
- Do not deploy, publish, push, or modify Git history. The surrounding workflow owns checks, preview, and release.
- Finish with a concise summary of changed behavior and any limitations.
