# Splendoure video production workflow

## Repository boundary

This repository owns social campaign planning, editable video compositions, and generated video exports. It must not contain Splendoura application backend, web, mobile, database, or deployment code.

The Splendoura application repository may provide approved screenshots and verified product facts as inputs, but those assets are copied into the local ignored `inputs/` directory or an approved asset store. The repositories remain independently versioned.

## Source and output boundary

| Content | Location | Git status |
|---|---|---|
| Creative rules and prompt | `PROMPT.md`, `AGENTS.md` | Tracked |
| Campaign intake template | `templates/BRIEF.md` | Tracked |
| Reusable starter project | `templates/video-project/` | Tracked |
| Editable video projects | `videos/<slug>/` | Tracked |
| Narration text and non-secret voice settings | `videos/<slug>/VOICEOVER.txt`, `voiceover.json` | Tracked |
| ElevenLabs credentials | Root `.env` | Ignored |
| Private briefs and source media | `inputs/` | Ignored |
| Renders, previews, and exports | `outputs/` | Ignored |
| Generated voice audio and timing cache | Project `assets/audio/`, `.media/voiceover/` | Ignored |
| HyperFrames caches and snapshots | Inside projects | Ignored |

## End-to-end process

### 1. Intake

Complete the campaign audience, platform, verified product facts, CTA, permissions, and constraints. Never infer unverified application behavior.

### 2. Project creation

```powershell
npm run video:new -- campaign-slug --title "Campaign title" --brief inputs/campaign.md
```

The command rejects unsafe slugs and existing project directories. It creates only a versionable starter project under `videos/`.

### 3. Concept review

Produce the emotional angle, hook, storyboard, exact on-screen copy, narration, sound direction, caption, hashtags, and alt text. Stop for approval unless end-to-end production was explicitly requested. Put only the approved spoken narration in `VOICEOVER.txt`; lines beginning with `# ` are comments and are not spoken.

For a narration-led project, the production agent runs `npm run video:voiceover -- campaign-slug` after narration approval, then uses `.media/voiceover/timeline.json` to set scene and caption timing. This is part of the automated production workflow; it does not require a separate user step.

### 4. Composition production

Build the approved storyboard with HyperFrames. Keep important information in platform-safe zones and preserve authentic supplied media. Use the project's pinned HyperFrames version for deterministic checks and renders.

New projects include `voiceover.json`. Its default `enabled: "auto"` setting activates ElevenLabs only when `VOICEOVER.txt` contains narration. Keep the API key in the root ignored `.env` file. A tracked voice ID is allowed; the API key is not.

### 5. Automated gate

```powershell
npm run video:doctor -- campaign-slug
npm run video:check -- campaign-slug
```

`doctor` checks repository structure. `check` delegates to HyperFrames and runs lint, browser runtime, layout, motion, and contrast audits.

Before HyperFrames validation, `check`, `preview`, and `render` run the automatic voiceover stage. It uses ElevenLabs' timestamped TTS endpoint, reuses unchanged generations, inserts the generated MP3 as a dedicated audio track, and calculates a pitch-preserving playback rate so the narration ends with the composition. Word timing is saved locally under `.media/voiceover/timeline.json` for captions and scene timing.

If narration cannot fit within the safe playback-rate range from `voiceover.json`, the command stops before preview or render. Revise timing instead of silently producing rushed or unnaturally stretched narration.

### 6. Human preview

```powershell
npm run video:preview -- campaign-slug
```

Review spelling, timing, safe zones, asset fidelity, motion, captions, pronunciation, narration pacing, and the exact voice/video ending alignment. A passing automated check is not final approval.

### 7. Approved render

```powershell
npm run video:render -- campaign-slug --approved --quality delivery
```

The manager writes a timestamped MP4 under `outputs/<slug>/exports/` and refuses to overwrite an existing export.

### 8. Delivery verification

Confirm the file exists and is non-empty. Inspect duration, dimensions, frame rate, audio, and decoded frames. Publish only the approved verified export.

## Git procedure

Before committing:

1. Run `npm test`.
2. Run `npm run video:doctor`.
3. Inspect `git status --short`.
4. Confirm no private inputs, generated outputs, caches, or secrets are staged.
5. Review the staged diff and file-size report.

The repository does not automatically publish media to any social platform.
