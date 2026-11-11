#!/usr/bin/env node

import { access, copyFile, mkdir } from "node:fs/promises";
import { constants } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";
import {
  createProject,
  inspectProject,
  listProjects,
  projectPath,
  resolveRenderPath,
} from "../lib/video-workspace.mjs";
import {
  listElevenLabsVoices,
  prepareVoiceover,
  selectProjectVoice,
} from "../lib/elevenlabs-voiceover.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const QUALITY_LEVELS = new Set(["draft", "looks", "delivery"]);

try {
  process.loadEnvFile(path.join(ROOT, ".env"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

function usage() {
  console.log(`Splendoure video workspace

Usage:
  npm run video -- list [--json]
  npm run video -- create <slug> [--title <title>] [--brief <repo-relative-path>]
  npm run video -- doctor [<slug> | --all] [--json]
  npm run video -- voices [--search <term>] [--gender <value>] [--age <value>] [--accent <value>] [--language <code>] [--use-case <value>] [--json]
  npm run video -- voice-select <slug> --voice-id <id> --reason <creative-fit>
  npm run video -- voiceover <slug> [--force] [--json]
  npm run video -- check <slug> [--strict]
  npm run video -- check --all [--strict]
  npm run video -- preview <slug>
  npm run video -- render <slug> --approved [--quality draft|looks|delivery] [--output <filename>]

Generated renders always stay beneath outputs/<slug>/exports/.`);
}

function parseArguments(argv) {
  const options = {};
  const positionals = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }
    const key = token.slice(2);
    if (["all", "approved", "force", "json", "strict"].includes(key)) {
      options[key] = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Option --${key} requires a value.`);
    options[key] = value;
    index += 1;
  }
  return { options, positionals };
}

async function run(command, args, { cwd }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, shell: false, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) reject(new Error(`${command} stopped by signal ${signal}.`));
      else resolve(code ?? 1);
    });
  });
}

async function npmScript(slug, script, extra = []) {
  const directory = projectPath(ROOT, slug);
  await access(path.join(directory, "package.json"), constants.R_OK);
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  return run(npm, ["run", script, ...(extra.length ? ["--", ...extra] : [])], { cwd: directory });
}

async function selectedProjects(slug, all) {
  if (all) return listProjects(ROOT);
  if (!slug) throw new Error("Provide a project slug or use --all.");
  return [{ slug, directory: projectPath(ROOT, slug) }];
}

async function prepareProjectVoiceover(slug, { force = false, quiet = false } = {}) {
  const result = await prepareVoiceover({
    projectDirectory: projectPath(ROOT, slug),
    force,
  });
  if (!quiet) {
    if (result.status === "generated") {
      console.log(
        `Voiceover generated and synchronized (${result.sourceDuration.toFixed(2)}s source, `
        + `${result.playbackRate.toFixed(3)}x timeline playback).`,
      );
    } else if (result.status === "reused" && result.indexChanged) {
      console.log(`Voiceover cache reused and timeline synchronized at ${result.playbackRate.toFixed(3)}x.`);
    }
  }
  return result;
}

async function initializeVoiceoverFiles(slug) {
  const directory = projectPath(ROOT, slug);
  for (const filename of ["VOICEOVER.txt", "voiceover.json"]) {
    const destination = path.join(directory, filename);
    try {
      await access(destination, constants.F_OK);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await copyFile(path.join(ROOT, "templates", "video-project", filename), destination);
    }
  }
}

async function commandList(options) {
  const projects = await listProjects(ROOT);
  const details = await Promise.all(projects.map(({ slug }) => inspectProject(ROOT, slug)));
  if (options.json) {
    console.log(JSON.stringify(details, null, 2));
    return 0;
  }
  if (!details.length) {
    console.log("No HyperFrames projects found under videos/.");
    return 0;
  }
  for (const project of details) {
    console.log(`${project.ok ? "✓" : "✗"} ${project.slug}${project.packageName ? ` (${project.packageName})` : ""}`);
  }
  return details.every((project) => project.ok) ? 0 : 1;
}

async function commandCreate(slug, options) {
  if (!slug) throw new Error("create requires a project slug.");
  const project = await createProject(ROOT, {
    slug,
    title: options.title,
    briefPath: options.brief,
  });
  console.log(`Created videos/${project.slug}`);
  console.log("Next: complete BRIEF.md and STORYBOARD.md before production.");
  return 0;
}

async function commandDoctor(slug, options) {
  const projects = await selectedProjects(slug, options.all || !slug);
  const details = await Promise.all(projects.map((project) => inspectProject(ROOT, project.slug)));
  if (options.json) console.log(JSON.stringify(details, null, 2));
  else {
    for (const project of details) {
      console.log(`${project.ok ? "PASS" : "FAIL"} ${project.slug}`);
      for (const error of project.errors) console.log(`  - ${error}`);
    }
  }
  return details.every((project) => project.ok) ? 0 : 1;
}

async function commandVoices(options) {
  const voices = await listElevenLabsVoices({
    apiKey: process.env.ELEVENLABS_API_KEY,
    apiBase: process.env.ELEVENLABS_API_BASE,
    search: options.search,
    gender: options.gender,
    age: options.age,
    accent: options.accent,
    language: options.language,
    useCase: options["use-case"],
  });
  if (options.json) {
    console.log(JSON.stringify(voices, null, 2));
    return 0;
  }
  if (!voices.length) {
    console.log("No ElevenLabs voices matched the requested filters.");
    return 0;
  }
  for (const voice of voices) {
    const labels = [
      voice.labels.gender,
      voice.labels.age,
      voice.labels.accent,
      voice.labels.use_case,
    ].filter(Boolean).join(", ");
    console.log(`${voice.name} | ${labels || "unlabelled"} | ${voice.voiceId}`);
  }
  return 0;
}

async function commandVoiceSelect(slug, options) {
  if (!slug) throw new Error("voice-select requires one project slug.");
  if (!options["voice-id"]) throw new Error("voice-select requires --voice-id.");
  if (!options.reason) throw new Error("voice-select requires --reason describing the creative fit.");
  const inspection = await inspectProject(ROOT, slug);
  if (!inspection.ok) throw new Error(inspection.errors.join(" "));
  await initializeVoiceoverFiles(slug);
  const result = await selectProjectVoice({
    projectDirectory: projectPath(ROOT, slug),
    voiceId: options["voice-id"],
    reason: options.reason,
  });
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else console.log(`Selected ${result.name} for ${slug}.`);
  return 0;
}

async function commandVoiceover(slug, options) {
  if (!slug) throw new Error("voiceover requires one project slug.");
  const inspection = await inspectProject(ROOT, slug);
  if (!inspection.ok) throw new Error(inspection.errors.join(" "));
  const result = await prepareProjectVoiceover(slug, { force: options.force, quiet: options.json });
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else if (["not-configured", "disabled", "waiting-for-narration"].includes(result.status)) {
    console.log(`Voiceover: ${result.status}.`);
  } else if (result.status === "reused" && !result.indexChanged) {
    console.log(`Voiceover is current and synchronized at ${result.playbackRate.toFixed(3)}x.`);
  }
  return 0;
}

async function commandCheck(slug, options) {
  const projects = await selectedProjects(slug, options.all);
  let failed = false;
  for (const project of projects) {
    const inspection = await inspectProject(ROOT, project.slug);
    if (!inspection.ok) {
      failed = true;
      console.error(`Structural validation failed for ${project.slug}:`);
      for (const error of inspection.errors) console.error(`  - ${error}`);
      continue;
    }
    await prepareProjectVoiceover(project.slug);
    console.log(`\nChecking ${project.slug}...`);
    const code = await npmScript(project.slug, "check", options.strict ? ["--strict"] : []);
    if (code !== 0) failed = true;
  }
  return failed ? 1 : 0;
}

async function commandPreview(slug) {
  if (!slug) throw new Error("preview requires one project slug.");
  const inspection = await inspectProject(ROOT, slug);
  if (!inspection.ok) throw new Error(inspection.errors.join(" "));
  await prepareProjectVoiceover(slug);
  console.log(`Checking ${slug} before preview...`);
  const checkCode = await npmScript(slug, "check");
  if (checkCode !== 0) return checkCode;
  return npmScript(slug, "dev");
}

async function commandRender(slug, options) {
  if (!slug) throw new Error("render requires one project slug.");
  if (!options.approved) {
    throw new Error("Rendering is blocked until the final preview is approved. Add --approved after approval.");
  }
  const quality = String(options.quality ?? "delivery").toLowerCase();
  if (!QUALITY_LEVELS.has(quality)) throw new Error("--quality must be draft, looks, or delivery.");

  const inspection = await inspectProject(ROOT, slug);
  if (!inspection.ok) throw new Error(inspection.errors.join(" "));
  const output = resolveRenderPath(ROOT, slug, options.output, quality);
  try {
    await access(output, constants.F_OK);
    throw new Error(`Refusing to overwrite existing export: ${output}`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await prepareProjectVoiceover(slug);
  console.log(`Checking ${slug} before render...`);
  const checkCode = await npmScript(slug, "check");
  if (checkCode !== 0) return checkCode;
  await mkdir(path.dirname(output), { recursive: true });
  const code = await npmScript(slug, "render", ["--quality", quality, "--output", output]);
  if (code === 0) console.log(`Exported ${path.relative(ROOT, output)}`);
  return code;
}

async function main() {
  const [command = "help", ...rest] = process.argv.slice(2);
  const { options, positionals } = parseArguments(rest);
  const slug = positionals[0];

  switch (command) {
    case "help":
    case "--help":
    case "-h":
      usage();
      return 0;
    case "list":
      return commandList(options);
    case "create":
      return commandCreate(slug, options);
    case "doctor":
      return commandDoctor(slug, options);
    case "voices":
      return commandVoices(options);
    case "voice-select":
      return commandVoiceSelect(slug, options);
    case "voiceover":
      return commandVoiceover(slug, options);
    case "check":
      return commandCheck(slug, options);
    case "preview":
      return commandPreview(slug);
    case "render":
      return commandRender(slug, options);
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  });
