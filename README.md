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
- An ElevenLabs API key and voice ID when narration is required

No application database or Splendoura backend is required.

For automatic voiceovers, copy `.env.example` to `.env` and set:

```dotenv
ELEVENLABS_API_KEY=your_private_key
ELEVENLABS_VOICE_ID=your_default_voice_id
```

The local `.env` file is ignored by Git. A project may override the default voice ID in its tracked `voiceover.json`, but API keys must never be stored there.

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

# Generate or resynchronize narration explicitly
npm run video:voiceover -- campaign-name

# Open the HyperFrames editor/preview
npm run video:preview -- campaign-name

# Render only after final preview approval
npm run video:render -- campaign-name --approved --quality delivery
```

The render command refuses to run without `--approved`. By default it writes a new timestamped file beneath `outputs/<project>/exports/`, preventing accidental replacement of an approved export.

## Automatic ElevenLabs voiceovers

Every newly created video project includes `VOICEOVER.txt` and `voiceover.json`. Once approved narration is placed in `VOICEOVER.txt`, the `check`, `preview`, and `render` commands automatically:

1. Generate timestamped speech with ElevenLabs Multilingual v2.
2. Cache the result by narration, voice, and voice settings so unchanged work does not spend credits again.
3. Add or update the HyperFrames voiceover track.
4. Fit the narration to the composition with pitch-preserving `data-playback-rate`.
5. Write word timing metadata under the ignored `.media/voiceover/` directory for caption and scene synchronization.

The gate stops if the required playback rate falls outside the configured safe range. Adjust the narration, composition duration, ElevenLabs speed, or project sync limits rather than allowing badly rushed or stretched speech. Run `npm run video:voiceover -- campaign-name --force` only when a fresh paid generation is intentionally required.

Generated MP3 files and voice timing caches stay local and are excluded from Git.

Run `npm run video -- help` for the complete command reference.

## Existing projects

Six existing Splendoure projects are stored in `videos/`. They remain independent HyperFrames projects with their own pinned CLI versions and can be checked or rendered through the root manager.

The manager intentionally delegates composition validation, preview, and rendering to each project's pinned HyperFrames CLI. It does not replace HyperFrames or duplicate its renderer.

## Campaign workflow

1. Copy and complete `templates/BRIEF.md` under `inputs/`.
2. Create a named video project with `npm run video:new`.
3. Generate and review the concept, hook, storyboard, on-screen copy, exact narration, caption, hashtags, and alt text.
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
- **Assets are missing after cloning:** Private inputs and generated outputs are intentionally ignored. Restore supplied assets from the approved source; ElevenLabs narration regenerates automatically when local credentials are configured.
- **Voiceover is not generated:** Add approved text to `VOICEOVER.txt`, then configure `ELEVENLABS_API_KEY` and either `ELEVENLABS_VOICE_ID` or `voiceId` in the project's `voiceover.json`.
- **Voiceover does not fit:** Follow the reported playback-rate error and revise narration, video duration, ElevenLabs speed, or the project's safe sync range.
- **Render command is blocked:** Review the final Studio preview and add `--approved` only after approval.
