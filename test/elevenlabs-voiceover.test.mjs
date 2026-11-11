import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  alignmentToWords,
  extractNarration,
  normalizeVoiceoverConfig,
  prepareVoiceover,
  readCompositionDuration,
  upsertVoiceoverTrack,
} from "../lib/elevenlabs-voiceover.mjs";

function alignmentFor(text) {
  return {
    characters: [...text],
    character_start_times_seconds: [...text].map((_, index) => index),
    character_end_times_seconds: [...text].map((_, index) => index + 1),
  };
}

async function projectFixture({ narration = "Hello world." } = {}) {
  const project = await mkdtemp(path.join(os.tmpdir(), "splendoure-voiceover-test-"));
  await mkdir(path.join(project, "assets", "audio"), { recursive: true });
  await writeFile(path.join(project, "VOICEOVER.txt"), `# production note\n${narration}\n`);
  await writeFile(path.join(project, "voiceover.json"), JSON.stringify({
    enabled: "auto",
    provider: "elevenlabs",
    script: "VOICEOVER.txt",
    output: "assets/audio/voiceover.mp3",
    voiceId: "voice-test",
    modelId: "eleven_multilingual_v2",
    outputFormat: "mp3_44100_128",
    sync: {
      start: 0,
      trackIndex: 10,
      volume: 1,
      minPlaybackRate: 0.8,
      maxPlaybackRate: 1.25,
    },
  }, null, 2));
  await writeFile(
    path.join(project, "index.html"),
    '<body><div id="root" data-composition-id="main" data-duration="10"><div>Scene</div></div></body>',
  );
  return project;
}

test("normalizes configuration without allowing embedded secrets", () => {
  const config = normalizeVoiceoverConfig({});
  assert.equal(config.provider, "elevenlabs");
  assert.equal(config.modelId, "eleven_multilingual_v2");
  assert.throws(() => normalizeVoiceoverConfig({ apiKey: "secret" }), /Do not store/);
});

test("extracts narration, reads composition duration, and upserts one audio track", () => {
  assert.equal(extractNarration("# note\nSpeak this.\n\nAnd this."), "Speak this.\n\nAnd this.");
  const html = '<div data-composition-id="main" data-duration="12"><div></div></div>';
  assert.equal(readCompositionDuration(html), 12);
  const once = upsertVoiceoverTrack(html, {
    src: "assets/audio/voiceover.mp3",
    start: 0,
    duration: 12,
    playbackRate: 1,
    trackIndex: 10,
    volume: 1,
  });
  const twice = upsertVoiceoverTrack(once, {
    src: "assets/audio/voiceover.mp3",
    start: 0,
    duration: 12,
    playbackRate: 1,
    trackIndex: 10,
    volume: 1,
  });
  assert.equal((twice.match(/data-splendoure-auto-voiceover/g) ?? []).length, 1);
  assert.equal(twice, once);
});

test("converts character alignment to timeline word timing", () => {
  const words = alignmentToWords(alignmentFor("Hi all"), { start: 1, playbackRate: 2 });
  assert.deepEqual(words, [
    { text: "Hi", start: 1, end: 2 },
    { text: "all", start: 2.5, end: 4 },
  ]);
});

test("generates timestamped ElevenLabs audio once and reuses the cache", async (t) => {
  const project = await projectFixture();
  t.after(() => rm(project, { recursive: true, force: true }));
  let calls = 0;
  const fetchImpl = async (url, options) => {
    calls += 1;
    assert.match(String(url), /\/v1\/text-to-speech\/voice-test\/with-timestamps/);
    assert.equal(options.headers["xi-api-key"], "test-key");
    const request = JSON.parse(options.body);
    assert.equal(request.model_id, "eleven_multilingual_v2");
    assert.equal(request.text, "Hello world.");
    return new Response(JSON.stringify({
      audio_base64: Buffer.from("fake mp3 bytes").toString("base64"),
      alignment: alignmentFor("Hello world."),
    }), {
      status: 200,
      headers: { "content-type": "application/json", "character-cost": "12", "request-id": "request-test" },
    });
  };

  const first = await prepareVoiceover({
    projectDirectory: project,
    env: { ELEVENLABS_API_KEY: "test-key" },
    fetchImpl,
    now: new Date("2026-11-11T10:00:00.000Z"),
  });
  assert.equal(first.status, "generated");
  assert.equal(first.playbackRate, 1.2);
  assert.equal(calls, 1);
  const html = await readFile(path.join(project, "index.html"), "utf8");
  assert.match(html, /id="elevenlabs-voiceover"/);
  assert.match(html, /data-duration="10"/);
  assert.match(html, /data-playback-rate="1.2"/);
  const timeline = JSON.parse(await readFile(path.join(project, ".media", "voiceover", "timeline.json"), "utf8"));
  assert.equal(timeline.words.length, 2);

  const second = await prepareVoiceover({
    projectDirectory: project,
    env: {},
    fetchImpl: async () => { throw new Error("cache should prevent a network call"); },
    now: new Date("2026-11-11T10:01:00.000Z"),
  });
  assert.equal(second.status, "reused");
  assert.equal(second.indexChanged, false);
  assert.equal(calls, 1);
});

test("auto mode waits for narration without requiring credentials", async (t) => {
  const project = await projectFixture({ narration: "" });
  t.after(() => rm(project, { recursive: true, force: true }));
  const result = await prepareVoiceover({ projectDirectory: project, env: {} });
  assert.equal(result.status, "waiting-for-narration");
});
