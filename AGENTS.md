# Codex instructions

This folder is a self-contained, prompt-driven social media advertisement generator.

When asked to generate a campaign:

1. Read `README.md`, `PROMPT.md`, and the user's completed brief.
2. Inspect only the reference assets explicitly supplied by the user.
3. Produce the concept package first in `outputs/<campaign-name>/concept.md`.
4. Stop for approval before creating images, audio, animation, or video unless the user explicitly requests end-to-end production.
5. Never invent product functionality or modify authentic screenshots.
6. Never commit secrets, `.env` files, private customer data, source media in `inputs/`, or generated media in `outputs/`.
7. Keep all generated claims verifiable and all important content within vertical-video safe zones.
8. When narration is approved, place the exact spoken text in the project's `VOICEOVER.txt`. The root video commands automatically generate and synchronize ElevenLabs audio from `voiceover.json`; never add API keys to project files.
9. For a narration-led video, generate the voiceover before locking scene timing and use `.media/voiceover/timeline.json` for scene and caption timing. Later checks reuse the cached audio unless narration or voice settings changed.

For video production, Codex must use the available HyperFrames workflow and relevant media tools. For still-image post production, use the available image-generation/editing workflow. Follow each installed skill's instructions before acting.
