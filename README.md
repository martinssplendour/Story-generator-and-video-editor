# Story Generator and Video Editor

A self-contained, Codex-driven workflow for creating Splendoure social campaign concepts, captions, still posts, carousels, and short vertical advertisements. It contains no runtime service, API integration, or bundled secret: Codex reads the brief and prompt, uses user-supplied assets, and writes campaign output locally.

## What is included

```text
Story-generator-and-video-editor/
|-- AGENTS.md             # Rules Codex automatically follows in this folder
|-- PROMPT.md             # Creative brief and quality standard
|-- README.md             # Setup and operating guide
|-- inputs/               # Local source assets; ignored by Git
|-- outputs/              # Generated campaign files; ignored by Git
`-- templates/
    `-- BRIEF.md          # Copy for each new campaign
```

The placeholder files keep `inputs/` and `outputs/` present after cloning. Their contents remain local and are excluded from Git.

## Requirements

### Required

- Git, for cloning and version control.
- Codex with access to this repository/workspace.
- A completed campaign brief based on `templates/BRIEF.md`.
- Any approved logos, screenshots, photographs, brand fonts, or other source assets.

There are no npm, Python, database, server, or API-key requirements for concept generation.

### Codex requirements

Codex must be able to:

- Read `README.md`, `PROMPT.md`, `AGENTS.md`, the campaign brief, and supplied assets.
- Write inside this folder, especially `outputs/`.
- Use image inspection for reference assets.
- Use the image-generation/editing skill for still-image production when requested.
- Use HyperFrames and its supporting media skills for video production when requested.

Availability of image and video tools depends on the Codex installation and account. If a production tool is unavailable, the concept, copy, storyboard, and implementation-ready directions can still be generated.

No OpenAI API key is needed when the work is performed through an authenticated Codex session. If this workflow is later integrated into a custom API application, keep `OPENAI_API_KEY` in a local environment or secret manager; never place it in this repository.

## Quick start

1. Clone the repository and enter this folder:

   ```powershell
   git clone https://github.com/martinssplendour/Story-generator-and-video-editor.git
   cd Story-generator-and-video-editor
   ```

2. Copy the brief template for a campaign:

   ```powershell
   Copy-Item templates/BRIEF.md inputs/my-campaign.md
   ```

3. Put approved source assets in `inputs/`. Use descriptive names such as `home-screen.png`, `logo.svg`, and `event-photo.jpg`.

4. Complete `inputs/my-campaign.md`. Only include claims and product behaviour that can be verified.

5. Ask Codex from this folder:

   ```text
   Read AGENTS.md, PROMPT.md, and inputs/my-campaign.md. Inspect the referenced assets. Create the concept package only and save it to outputs/my-campaign/concept.md. Do not produce final media until I approve the concept.
   ```

6. Review the concept and request revisions. After approval, ask Codex to produce the requested still, carousel, or video and export it beneath `outputs/my-campaign/`.

## Recommended campaign workflow

1. **Brief:** Define the audience, platform, message, verified facts, CTA, and constraints.
2. **Concept:** Generate the hook, emotional angle, copy, storyboard, caption, hashtags, and alt text.
3. **Review:** Check brand accuracy, product claims, accessibility, and asset permissions.
4. **Production:** Create the approved visual or motion project.
5. **Preview:** Review spelling, safe zones, legibility, timing, audio, and screenshot fidelity.
6. **Export:** Produce platform-ready files without overwriting approved versions.

## Suggested output layout

```text
outputs/my-campaign/
|-- concept.md
|-- caption.txt
|-- alt-text.txt
|-- project/          # Editable production source, if applicable
|-- previews/
`-- exports/
```

## Security and privacy

- `inputs/`, `outputs/`, `.env`, and `.env.*` are ignored by this folder's `.gitignore`.
- Do not put API keys, access tokens, credentials, private customer data, or identity documents in briefs or prompts.
- Treat supplied photos, voice samples, and screenshots as private unless publication rights are confirmed.
- Review `git diff --cached` before every commit.
- Scan staged files for likely credentials before pushing. Example:

  ```powershell
  git diff --cached --name-only
  git grep -n -I -E "(api[_-]?key|secret|token|password|BEGIN (RSA|OPENSSH|EC) PRIVATE KEY)" -- social-media-post-generator
  ```

The scan is a safeguard, not a guarantee. Use GitHub secret scanning where available and rotate any credential immediately if it is ever committed.

## Updating the generator

Edit `PROMPT.md` for creative or output requirements, `templates/BRIEF.md` for campaign inputs, and `AGENTS.md` for Codex operating rules. Keep the folder self-contained and never add generated media or private source assets to version control.

## Troubleshooting

- **Codex invents a feature:** Add verified product facts and prohibited claims to the brief, then regenerate the affected copy.
- **Text is hard to read:** Reduce word count, increase contrast and type size, and recheck platform safe zones.
- **Assets are missing after cloning:** This is intentional; the contents of `inputs/` are private and ignored. Restore them from the approved asset source.
- **No final media is produced:** The default workflow pauses after the concept package. Explicitly approve it and request production.
- **A media skill is unavailable:** Generate the concept and implementation directions, then run production in a Codex environment with the required image or HyperFrames capability.
