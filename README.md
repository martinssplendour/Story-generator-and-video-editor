# Story Generator and Video Editor

A separate, self-contained workspace for producing Splendoure social campaigns and short-form story videos. The repository combines a Codex creative workflow, reusable project-management code, and editable HyperFrames projects without mixing video production into the Splendoura application repository.

## What lives here

```text
Story-generator-and-video-editor/
|-- AGENTS.md                 # Operating rules for Codex
|-- PROMPT.md                 # Splendoure creative and quality standard
|-- inputs/                   # Private campaign briefs and source media (ignored)
|-- outputs/                  # Generated previews and final exports (ignored)
|-- videos/                   # Editable HyperFrames project source
|-- templates/
|   |-- BRIEF.md              # Campaign intake template
|   `-- video-project/        # Starter project used by `video create`
|-- lib/                      # Reusable workspace logic
|-- scripts/video-manager.mjs # Safe CLI for project operations
|-- test/                     # Node test suite
`-- docs/WORKFLOW.md          # End-to-end operating guide
```

Generated renders, snapshots, thumbnails, local caches, campaign inputs, and exported media are deliberately excluded from Git. Composition code, project configuration, storyboards, briefs, and approved reusable assets can be versioned.

## Requirements

- Node.js 22 or newer
- Git
- FFmpeg for rendering and media inspection
- Internet access the first time a pinned HyperFrames CLI version is downloaded
- Codex with the HyperFrames workflow available for assisted story and composition creation

No application database or Splendoura backend is required.

## Quick start

```powershell
npm test
npm run video:list
npm run video:doctor
```

Create a project from the reusable starter:

```powershell
npm run video:new -- campaign-name --title "Campaign title"
```

Optionally start from a completed brief:

```powershell
npm run video:new -- campaign-name --title "Campaign title" --brief inputs/campaign-name.md
```

Then ask Codex to read `AGENTS.md`, `PROMPT.md`, and the project's `BRIEF.md`, develop the concept and storyboard, and wait for approval before producing final media.

## Project commands

```powershell
# Show all editable projects
npm run video:list

# Validate repository/project structure without launching a browser
npm run video:doctor
npm run video:doctor -- campaign-name

# Run the full HyperFrames browser gate
npm run video:check -- campaign-name
npm run video:check -- --all

# Open the HyperFrames editor/preview
npm run video:preview -- campaign-name

# Render only after final preview approval
npm run video:render -- campaign-name --approved --quality delivery
```

The render command refuses to run without `--approved`. By default it writes a new timestamped file beneath `outputs/<project>/exports/`, preventing accidental replacement of an approved export.

Run `npm run video -- help` for the complete command reference.

## Existing projects

Six existing Splendoure projects are stored in `videos/`. They remain independent HyperFrames projects with their own pinned CLI versions and can be checked or rendered through the root manager.

The manager intentionally delegates composition validation, preview, and rendering to each project's pinned HyperFrames CLI. It does not replace HyperFrames or duplicate its renderer.

## Campaign workflow

1. Copy and complete `templates/BRIEF.md` under `inputs/`.
2. Create a named video project with `npm run video:new`.
3. Generate and review the concept, hook, storyboard, on-screen copy, voice-over, caption, hashtags, and alt text.
4. Build or revise the HyperFrames composition only after the concept is approved.
5. Run `npm run video:check -- <project>`.
6. Open `npm run video:preview -- <project>` and review the assembled timeline.
7. Render only after final preview approval.
8. Verify the exported MP4 visually and technically before publishing.

See [docs/WORKFLOW.md](docs/WORKFLOW.md) for the detailed workflow and repository boundaries.

## Security and privacy

- Never commit `.env` files, credentials, customer data, identity documents, or private campaign media.
- `inputs/` and `outputs/` stay local and are ignored by Git.
- Treat supplied photos, voice samples, and screenshots as private unless publication rights are confirmed.
- Do not invent product capabilities or alter authentic application screenshots.
- Review staged content before every commit:

  ```powershell
  git diff --cached --name-only
  git diff --cached
  ```

- If a required source asset must be shared, use an approved asset store or Git LFS rather than bypassing repository limits.

## Troubleshooting

- **Project not found:** Run `npm run video:list` and use the exact slug.
- **Project doctor fails:** Restore the required `package.json`, `hyperframes.json`, `index.html`, `BRIEF.md`, or `STORYBOARD.md` file.
- **HyperFrames is unavailable:** Ensure Node 22+, FFmpeg, and internet access are available, then rerun the project command.
- **Assets are missing after cloning:** Private inputs and generated outputs are intentionally ignored. Restore them from the approved asset source.
- **Render command is blocked:** Review the final Studio preview and add `--approved` only after approval.
