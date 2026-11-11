import { createHash } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_CONFIG = Object.freeze({
  enabled: "auto",
  provider: "elevenlabs",
  script: "VOICEOVER.txt",
  output: "assets/audio/voiceover.mp3",
  modelId: "eleven_multilingual_v2",
  outputFormat: "mp3_44100_128",
  voiceSettings: {
    stability: 0.5,
    similarityBoost: 0.75,
    style: 0,
    useSpeakerBoost: true,
    speed: 1,
  },
  sync: {
    start: 0,
    trackIndex: 10,
    volume: 1,
    minPlaybackRate: 0.8,
    maxPlaybackRate: 1.25,
  },
});

const CONFIG_FILE = "voiceover.json";
const CACHE_DIRECTORY = path.join(".media", "voiceover");
const STATE_FILE = "state.json";
const RAW_ALIGNMENT_FILE = "alignment.raw.json";
const TIMELINE_FILE = "timeline.json";

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

function inside(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function resolveProjectFile(projectDirectory, relativeFile, label) {
  if (typeof relativeFile !== "string" || !relativeFile.trim()) {
    throw new Error(`${label} must be a non-empty repository-relative path.`);
  }
  const candidate = path.resolve(projectDirectory, relativeFile);
  if (!inside(projectDirectory, candidate)) {
    throw new Error(`${label} must stay inside the project directory.`);
  }
  return candidate;
}

function finiteNumber(value, fallback, label, { min = -Infinity, max = Infinity } = {}) {
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new Error(`${label} must be a number between ${min} and ${max}.`);
  }
  return number;
}

export function normalizeVoiceoverConfig(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("voiceover.json must contain a JSON object.");
  }
  if (Object.hasOwn(input, "apiKey") || Object.hasOwn(input, "api_key")) {
    throw new Error("Do not store an ElevenLabs API key in voiceover.json; use ELEVENLABS_API_KEY.");
  }

  const enabled = input.enabled ?? DEFAULT_CONFIG.enabled;
  if (![true, false, "auto"].includes(enabled)) {
    throw new Error('voiceover.json enabled must be true, false, or "auto".');
  }
  const provider = input.provider ?? DEFAULT_CONFIG.provider;
  if (provider !== "elevenlabs") {
    throw new Error('voiceover.json provider must be "elevenlabs".');
  }

  const voiceSettingsInput = input.voiceSettings ?? {};
  const syncInput = input.sync ?? {};
  const minPlaybackRate = finiteNumber(
    syncInput.minPlaybackRate,
    DEFAULT_CONFIG.sync.minPlaybackRate,
    "sync.minPlaybackRate",
    { min: 0.5, max: 2 },
  );
  const maxPlaybackRate = finiteNumber(
    syncInput.maxPlaybackRate,
    DEFAULT_CONFIG.sync.maxPlaybackRate,
    "sync.maxPlaybackRate",
    { min: 0.5, max: 2 },
  );
  if (minPlaybackRate > maxPlaybackRate) {
    throw new Error("sync.minPlaybackRate cannot exceed sync.maxPlaybackRate.");
  }

  const outputFormat = input.outputFormat ?? DEFAULT_CONFIG.outputFormat;
  if (!/^mp3_\d+_\d+$/.test(outputFormat)) {
    throw new Error("outputFormat must be an ElevenLabs MP3 format such as mp3_44100_128.");
  }

  return {
    enabled,
    provider,
    script: input.script ?? DEFAULT_CONFIG.script,
    output: input.output ?? DEFAULT_CONFIG.output,
    voiceId: String(input.voiceId ?? "").trim(),
    modelId: String(input.modelId ?? DEFAULT_CONFIG.modelId).trim(),
    outputFormat,
    seed: input.seed === undefined || input.seed === null
      ? null
      : finiteNumber(input.seed, null, "seed", { min: 0, max: 4294967295 }),
    voiceSettings: {
      stability: finiteNumber(
        voiceSettingsInput.stability,
        DEFAULT_CONFIG.voiceSettings.stability,
        "voiceSettings.stability",
        { min: 0, max: 1 },
      ),
      similarityBoost: finiteNumber(
        voiceSettingsInput.similarityBoost,
        DEFAULT_CONFIG.voiceSettings.similarityBoost,
        "voiceSettings.similarityBoost",
        { min: 0, max: 1 },
      ),
      style: finiteNumber(
        voiceSettingsInput.style,
        DEFAULT_CONFIG.voiceSettings.style,
        "voiceSettings.style",
        { min: 0, max: 1 },
      ),
      useSpeakerBoost: voiceSettingsInput.useSpeakerBoost ?? DEFAULT_CONFIG.voiceSettings.useSpeakerBoost,
      speed: finiteNumber(
        voiceSettingsInput.speed,
        DEFAULT_CONFIG.voiceSettings.speed,
        "voiceSettings.speed",
        { min: 0.5, max: 2 },
      ),
    },
    sync: {
      start: finiteNumber(syncInput.start, DEFAULT_CONFIG.sync.start, "sync.start", { min: 0 }),
      trackIndex: finiteNumber(
        syncInput.trackIndex,
        DEFAULT_CONFIG.sync.trackIndex,
        "sync.trackIndex",
        { min: 0, max: 999 },
      ),
      volume: finiteNumber(syncInput.volume, DEFAULT_CONFIG.sync.volume, "sync.volume", { min: 0, max: 4 }),
      minPlaybackRate,
      maxPlaybackRate,
    },
  };
}

export function extractNarration(contents) {
  if (typeof contents !== "string") throw new TypeError("Narration must be text.");
  return contents
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      return trimmed !== "#" && !trimmed.startsWith("# ");
    })
    .join("\n")
    .trim();
}

export function readCompositionDuration(indexHtml) {
  if (typeof indexHtml !== "string") throw new TypeError("Composition HTML must be text.");
  const root = indexHtml.match(/<[a-z][\w:-]*\b[^>]*\bdata-composition-id\s*=\s*(["'])[^"']+\1[^>]*>/i);
  if (!root) throw new Error("index.html does not contain a composition root.");
  const duration = root[0].match(/\bdata-duration\s*=\s*(["'])([^"']+)\1/i);
  const seconds = Number(duration?.[2]);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error("The composition root must have a positive numeric data-duration for automatic voiceover sync.");
  }
  return seconds;
}

function formatNumber(value) {
  return Number(value.toFixed(6)).toString();
}

export function upsertVoiceoverTrack(indexHtml, {
  src,
  start,
  duration,
  playbackRate,
  trackIndex,
  volume,
} = {}) {
  const root = indexHtml.match(/<[a-z][\w:-]*\b[^>]*\bdata-composition-id\s*=\s*(["'])[^"']+\1[^>]*>/i);
  if (!root || root.index === undefined) throw new Error("index.html does not contain a composition root.");
  const normalizedSrc = String(src).replaceAll("\\", "/");
  const audio = [
    '<audio id="elevenlabs-voiceover" data-splendoure-auto-voiceover="true"',
    `src="${normalizedSrc}"`,
    `data-start="${formatNumber(start)}"`,
    `data-duration="${formatNumber(duration)}"`,
    `data-playback-rate="${formatNumber(playbackRate)}"`,
    `data-track-index="${formatNumber(trackIndex)}"`,
    `data-volume="${formatNumber(volume)}"`,
    'preload="auto"></audio>',
  ].join(" ");
  const existing = /<audio\b[^>]*\bdata-splendoure-auto-voiceover\s*=\s*(["'])true\1[^>]*>\s*<\/audio>/i;
  if (existing.test(indexHtml)) return indexHtml.replace(existing, audio);
  const insertion = root.index + root[0].length;
  return `${indexHtml.slice(0, insertion)}\n      ${audio}${indexHtml.slice(insertion)}`;
}

export function alignmentToWords(alignment, { start = 0, playbackRate = 1 } = {}) {
  const characters = alignment?.characters;
  const starts = alignment?.character_start_times_seconds;
  const ends = alignment?.character_end_times_seconds;
  if (!Array.isArray(characters) || !Array.isArray(starts) || !Array.isArray(ends)) return [];
  if (characters.length !== starts.length || characters.length !== ends.length) {
    throw new Error("ElevenLabs returned inconsistent alignment arrays.");
  }

  const words = [];
  let current = null;
  const flush = () => {
    if (!current) return;
    current.text = current.text.trim();
    if (current.text) words.push(current);
    current = null;
  };

  for (let index = 0; index < characters.length; index += 1) {
    const character = String(characters[index]);
    if (/\s/.test(character)) {
      flush();
      continue;
    }
    const wordStart = start + Number(starts[index]) / playbackRate;
    const wordEnd = start + Number(ends[index]) / playbackRate;
    if (!Number.isFinite(wordStart) || !Number.isFinite(wordEnd)) continue;
    if (!current) current = { text: "", start: wordStart, end: wordEnd };
    current.text += character;
    current.end = wordEnd;
  }
  flush();
  return words.map((word) => ({
    text: word.text,
    start: Number(word.start.toFixed(6)),
    end: Number(word.end.toFixed(6)),
  }));
}

function alignmentDuration(alignment) {
  const ends = alignment?.character_end_times_seconds;
  if (!Array.isArray(ends) || !ends.length) {
    throw new Error("ElevenLabs did not return character timing data.");
  }
  const duration = Math.max(...ends.map(Number).filter(Number.isFinite));
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("ElevenLabs returned an invalid voiceover duration.");
  }
  return duration;
}

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function writeAtomic(file, data, encoding) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, data, encoding);
  await rename(temporary, file);
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

function safeApiBase(value) {
  const url = new URL(value || "https://api.elevenlabs.io");
  const local = new Set(["localhost", "127.0.0.1", "::1"]).has(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
    throw new Error("ELEVENLABS_API_BASE must use HTTPS (HTTP is allowed only for a local test server).");
  }
  return url.toString().replace(/\/$/, "");
}

export async function requestElevenLabsVoiceover({
  apiKey,
  apiBase,
  voiceId,
  text,
  config,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is required to generate a voiceover.");
  if (!voiceId) throw new Error("Set voiceId in voiceover.json or ELEVENLABS_VOICE_ID in the local environment.");
  if (typeof fetchImpl !== "function") throw new Error("This Node.js runtime does not provide fetch.");

  const url = new URL(
    `${safeApiBase(apiBase)}/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps`,
  );
  url.searchParams.set("output_format", config.outputFormat);
  const body = {
    text,
    model_id: config.modelId,
    voice_settings: {
      stability: config.voiceSettings.stability,
      similarity_boost: config.voiceSettings.similarityBoost,
      style: config.voiceSettings.style,
      use_speaker_boost: Boolean(config.voiceSettings.useSpeakerBoost),
      speed: config.voiceSettings.speed,
    },
  };
  if (config.seed !== null) body.seed = config.seed;

  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "xi-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 800).replaceAll(apiKey, "[REDACTED]");
    throw new Error(`ElevenLabs TTS failed (${response.status}): ${detail || response.statusText}`);
  }
  const payload = await response.json();
  if (!payload.audio_base64) throw new Error("ElevenLabs returned no audio data.");
  const alignment = payload.normalized_alignment ?? payload.alignment;
  const duration = alignmentDuration(alignment);
  const audio = Buffer.from(payload.audio_base64, "base64");
  if (!audio.length) throw new Error("ElevenLabs returned an empty audio file.");
  return {
    audio,
    alignment,
    duration,
    characterCost: response.headers.get("character-cost"),
    requestId: response.headers.get("request-id"),
  };
}

export async function inspectVoiceoverSetup(projectDirectory, { env = process.env } = {}) {
  const configFile = path.join(projectDirectory, CONFIG_FILE);
  if (!(await exists(configFile))) {
    return { configured: false, enabled: false, status: "not-configured", errors: [] };
  }
  try {
    const config = normalizeVoiceoverConfig(await readJson(configFile));
    const scriptFile = resolveProjectFile(projectDirectory, config.script, "Voiceover script path");
    const outputFile = resolveProjectFile(projectDirectory, config.output, "Voiceover output path");
    const scriptExists = await exists(scriptFile);
    const narration = scriptExists ? extractNarration(await readFile(scriptFile, "utf8")) : "";
    const voiceId = config.voiceId || env.ELEVENLABS_VOICE_ID || "";
    return {
      configured: true,
      enabled: config.enabled !== false,
      status: config.enabled === false ? "disabled" : narration ? "ready" : "waiting-for-narration",
      script: path.relative(projectDirectory, scriptFile),
      output: path.relative(projectDirectory, outputFile),
      hasNarration: Boolean(narration),
      hasApiKey: Boolean(env.ELEVENLABS_API_KEY),
      hasVoiceId: Boolean(voiceId),
      errors: [],
    };
  } catch (error) {
    return { configured: true, enabled: false, status: "invalid", errors: [error.message] };
  }
}

export async function prepareVoiceover({
  projectDirectory,
  env = process.env,
  fetchImpl = globalThis.fetch,
  force = false,
  now = new Date(),
} = {}) {
  const configFile = path.join(projectDirectory, CONFIG_FILE);
  if (!(await exists(configFile))) return { status: "not-configured", generated: false };

  const config = normalizeVoiceoverConfig(await readJson(configFile));
  if (config.enabled === false) return { status: "disabled", generated: false };

  const scriptFile = resolveProjectFile(projectDirectory, config.script, "Voiceover script path");
  if (!(await exists(scriptFile))) {
    if (config.enabled === "auto") return { status: "waiting-for-narration", generated: false };
    throw new Error(`Voiceover script not found: ${path.relative(projectDirectory, scriptFile)}`);
  }
  const narration = extractNarration(await readFile(scriptFile, "utf8"));
  if (!narration) {
    if (config.enabled === "auto") return { status: "waiting-for-narration", generated: false };
    throw new Error("Voiceover is enabled, but the narration script is empty.");
  }

  const outputFile = resolveProjectFile(projectDirectory, config.output, "Voiceover output path");
  if (path.extname(outputFile).toLowerCase() !== ".mp3") {
    throw new Error("The automatic ElevenLabs voiceover output must be an .mp3 file.");
  }
  const indexFile = path.join(projectDirectory, "index.html");
  const indexHtml = await readFile(indexFile, "utf8");
  const compositionDuration = readCompositionDuration(indexHtml);
  const availableDuration = compositionDuration - config.sync.start;
  if (availableDuration <= 0) throw new Error("Voiceover sync.start must be before the composition ends.");

  const cacheDirectory = path.join(projectDirectory, CACHE_DIRECTORY);
  const stateFile = path.join(cacheDirectory, STATE_FILE);
  const rawAlignmentFile = path.join(cacheDirectory, RAW_ALIGNMENT_FILE);
  const timelineFile = path.join(cacheDirectory, TIMELINE_FILE);
  const voiceId = config.voiceId || env.ELEVENLABS_VOICE_ID || "";
  const generationHash = hash({
    narration,
    voiceId,
    modelId: config.modelId,
    outputFormat: config.outputFormat,
    seed: config.seed,
    voiceSettings: config.voiceSettings,
  });

  let state = (await exists(stateFile)) ? await readJson(stateFile) : null;
  let alignment = (await exists(rawAlignmentFile)) ? await readJson(rawAlignmentFile) : null;
  const cacheUsable = !force
    && state?.generationHash === generationHash
    && Number.isFinite(state?.rawDuration)
    && await exists(outputFile)
    && alignment;
  let generated = false;

  if (!cacheUsable) {
    const generatedVoice = await requestElevenLabsVoiceover({
      apiKey: env.ELEVENLABS_API_KEY,
      apiBase: env.ELEVENLABS_API_BASE,
      voiceId,
      text: narration,
      config,
      fetchImpl,
    });
    await writeAtomic(outputFile, generatedVoice.audio);
    await writeAtomic(rawAlignmentFile, `${JSON.stringify(generatedVoice.alignment, null, 2)}\n`, "utf8");
    alignment = generatedVoice.alignment;
    state = {
      generationHash,
      rawDuration: generatedVoice.duration,
      generatedAt: now.toISOString(),
      provider: "elevenlabs",
      modelId: config.modelId,
      voiceId,
      outputFormat: config.outputFormat,
      characterCost: generatedVoice.characterCost,
      requestId: generatedVoice.requestId,
    };
    await writeAtomic(stateFile, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    generated = true;
  }

  const rawDuration = Number(state.rawDuration);
  const playbackRate = rawDuration / availableDuration;
  if (playbackRate < config.sync.minPlaybackRate || playbackRate > config.sync.maxPlaybackRate) {
    throw new Error(
      `Voiceover needs ${playbackRate.toFixed(3)}x playback to fit ${availableDuration.toFixed(3)}s; `
      + `the allowed range is ${config.sync.minPlaybackRate}x-${config.sync.maxPlaybackRate}x. `
      + "Adjust the narration, composition duration, ElevenLabs speed, or sync limits.",
    );
  }

  const relativeAudio = path.relative(projectDirectory, outputFile).replaceAll("\\", "/");
  const updatedHtml = upsertVoiceoverTrack(indexHtml, {
    src: relativeAudio,
    start: config.sync.start,
    duration: availableDuration,
    playbackRate,
    trackIndex: config.sync.trackIndex,
    volume: config.sync.volume,
  });
  const indexChanged = updatedHtml !== indexHtml;
  if (indexChanged) await writeAtomic(indexFile, updatedHtml, "utf8");

  const words = alignmentToWords(alignment, { start: config.sync.start, playbackRate });
  const timeline = {
    provider: "elevenlabs",
    script: path.relative(projectDirectory, scriptFile).replaceAll("\\", "/"),
    audio: relativeAudio,
    compositionDuration,
    sourceDuration: rawDuration,
    start: config.sync.start,
    duration: availableDuration,
    playbackRate: Number(playbackRate.toFixed(6)),
    words,
  };
  await writeAtomic(timelineFile, `${JSON.stringify(timeline, null, 2)}\n`, "utf8");
  state = {
    ...state,
    lastSyncedAt: now.toISOString(),
    compositionDuration,
    playbackRate: timeline.playbackRate,
  };
  await writeAtomic(stateFile, `${JSON.stringify(state, null, 2)}\n`, "utf8");

  return {
    status: generated ? "generated" : "reused",
    generated,
    indexChanged,
    output: relativeAudio,
    sourceDuration: rawDuration,
    compositionDuration,
    playbackRate: timeline.playbackRate,
    words: words.length,
  };
}
