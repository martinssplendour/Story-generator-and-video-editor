import { cp, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { inspectVoiceoverSetup } from "./elevenlabs-voiceover.mjs";

export const REQUIRED_PROJECT_FILES = [
  "package.json",
  "hyperframes.json",
  "index.html",
  "BRIEF.md",
  "STORYBOARD.md",
];

const TEXT_TEMPLATE_EXTENSIONS = new Set([".css", ".html", ".json", ".md", ".txt"]);

export function normalizeSlug(value) {
  if (typeof value !== "string") {
    throw new TypeError("Project slug must be a string.");
  }

  const slug = value.trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error("Project slug must use lowercase letters, numbers, and single hyphens only.");
  }
  return slug;
}

export function titleFromSlug(slug) {
  return normalizeSlug(slug)
    .split("-")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

export function isPathInside(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function projectPath(root, slug) {
  const safeSlug = normalizeSlug(slug);
  const videosDir = path.join(path.resolve(root), "videos");
  const candidate = path.join(videosDir, safeSlug);
  if (!isPathInside(videosDir, candidate)) {
    throw new Error("Project path escaped the videos directory.");
  }
  return candidate;
}

export async function listProjects(root) {
  const videosDir = path.join(path.resolve(root), "videos");
  let entries = [];
  try {
    entries = await readdir(videosDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }

  const projects = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const directory = path.join(videosDir, entry.name);
    try {
      await stat(path.join(directory, "hyperframes.json"));
      projects.push({ slug: entry.name, directory });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return projects.sort((a, b) => a.slug.localeCompare(b.slug));
}

export async function inspectProject(root, slug) {
  const directory = projectPath(root, slug);
  const missing = [];
  for (const file of REQUIRED_PROJECT_FILES) {
    try {
      await stat(path.join(directory, file));
    } catch (error) {
      if (error.code === "ENOENT") missing.push(file);
      else throw error;
    }
  }

  const errors = missing.map((file) => `Missing required file: ${file}`);
  let packageJson = null;
  let hyperframes = null;
  let indexHtml = "";

  if (!missing.includes("package.json")) {
    try {
      packageJson = JSON.parse(await readFile(path.join(directory, "package.json"), "utf8"));
      for (const script of ["dev", "check", "render"]) {
        if (!packageJson.scripts?.[script]) errors.push(`package.json is missing the ${script} script.`);
      }
    } catch (error) {
      errors.push(`Invalid package.json: ${error.message}`);
    }
  }

  if (!missing.includes("hyperframes.json")) {
    try {
      hyperframes = JSON.parse(await readFile(path.join(directory, "hyperframes.json"), "utf8"));
    } catch (error) {
      errors.push(`Invalid hyperframes.json: ${error.message}`);
    }
  }

  if (!missing.includes("index.html")) {
    indexHtml = await readFile(path.join(directory, "index.html"), "utf8");
    if (!/data-composition-id\s*=/.test(indexHtml)) {
      errors.push("index.html does not declare data-composition-id.");
    }
    if (!/data-(?:duration|end)\s*=/.test(indexHtml)) {
      errors.push("index.html does not declare a composition duration.");
    }
  }

  const voiceover = await inspectVoiceoverSetup(directory);
  for (const error of voiceover.errors) errors.push(`Invalid voiceover configuration: ${error}`);

  return {
    slug: normalizeSlug(slug),
    directory,
    ok: errors.length === 0,
    errors,
    packageName: packageJson?.name ?? null,
    authoringSkill: hyperframes?.authoringSkill ?? null,
    voiceover,
  };
}

async function replaceTemplateTokens(directory, replacements) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const item = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await replaceTemplateTokens(item, replacements);
      continue;
    }
    if (!entry.isFile() || !TEXT_TEMPLATE_EXTENSIONS.has(path.extname(entry.name))) continue;

    let contents = await readFile(item, "utf8");
    for (const [token, value] of Object.entries(replacements)) {
      contents = contents.replaceAll(token, value);
    }
    await writeFile(item, contents, "utf8");
  }
}

export async function createProject(root, { slug, title, briefPath } = {}) {
  const safeSlug = normalizeSlug(slug);
  const resolvedRoot = path.resolve(root);
  const destination = projectPath(resolvedRoot, safeSlug);
  const template = path.join(resolvedRoot, "templates", "video-project");
  let sourceBrief = null;

  if (briefPath) {
    sourceBrief = path.resolve(root, briefPath);
    if (!isPathInside(root, sourceBrief)) {
      throw new Error("Brief path must stay inside the repository.");
    }
    await stat(sourceBrief);
  }

  try {
    await stat(destination);
    throw new Error(`Project already exists: ${safeSlug}`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  await stat(template);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(template, destination, { recursive: true, errorOnExist: true, force: false });

  const projectTitle = title?.trim() || titleFromSlug(safeSlug);
  await replaceTemplateTokens(destination, {
    __SLUG__: safeSlug,
    __TITLE__: projectTitle,
    __CREATED_DATE__: new Date().toISOString().slice(0, 10),
  });

  if (sourceBrief) {
    await cp(sourceBrief, path.join(destination, "BRIEF.md"), { force: true });
  }

  return inspectProject(resolvedRoot, safeSlug);
}

export function defaultRenderPath(root, slug, quality = "delivery", now = new Date()) {
  const safeSlug = normalizeSlug(slug);
  const safeQuality = String(quality).toLowerCase();
  if (!new Set(["draft", "looks", "delivery"]).has(safeQuality)) {
    throw new Error("Render quality must be draft, looks, or delivery.");
  }
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  return path.join(path.resolve(root), "outputs", safeSlug, "exports", `${safeSlug}_${safeQuality}_${stamp}.mp4`);
}

export function resolveRenderPath(root, slug, requested, quality = "delivery") {
  const outputsDir = path.join(path.resolve(root), "outputs");
  if (requested && (path.basename(requested) !== requested || path.extname(requested).toLowerCase() !== ".mp4")) {
    throw new Error("Render output must be an .mp4 filename without directory segments.");
  }
  const candidate = requested
    ? path.join(outputsDir, normalizeSlug(slug), "exports", requested)
    : defaultRenderPath(root, slug, quality);
  if (!isPathInside(outputsDir, candidate)) {
    throw new Error("Render output must stay inside the repository outputs directory.");
  }
  return candidate;
}
