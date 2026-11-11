import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createProject,
  defaultRenderPath,
  inspectProject,
  isPathInside,
  listProjects,
  normalizeSlug,
  resolveRenderPath,
  titleFromSlug,
} from "../lib/video-workspace.mjs";

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "splendoure-video-test-"));
  const template = path.join(root, "templates", "video-project");
  await mkdir(template, { recursive: true });
  await writeFile(path.join(template, "package.json"), JSON.stringify({
    name: "__SLUG__",
    scripts: { dev: "preview", check: "check", render: "render" },
  }));
  await writeFile(path.join(template, "hyperframes.json"), "{}");
  await writeFile(path.join(template, "index.html"), '<div data-composition-id="main" data-duration="5">__TITLE__</div>');
  await writeFile(path.join(template, "BRIEF.md"), "# __TITLE__\n");
  await writeFile(path.join(template, "STORYBOARD.md"), "# __SLUG__\n");
  return root;
}

test("normalizes safe slugs and derives titles", () => {
  assert.equal(normalizeSlug("campaign-2026"), "campaign-2026");
  assert.equal(titleFromSlug("campaign-2026"), "Campaign 2026");
  assert.throws(() => normalizeSlug("../escape"), /lowercase letters/);
  assert.throws(() => normalizeSlug("Two Words"), /lowercase letters/);
});

test("path containment rejects traversal", () => {
  const parent = path.resolve("workspace", "outputs");
  assert.equal(isPathInside(parent, path.join(parent, "campaign", "out.mp4")), true);
  assert.equal(isPathInside(parent, path.resolve(parent, "..", "secret")), false);
});

test("creates and inspects a project from the starter", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));

  const created = await createProject(root, { slug: "new-campaign", title: "New Campaign" });
  assert.equal(created.ok, true);
  assert.equal((await readFile(path.join(created.directory, "BRIEF.md"), "utf8")).trim(), "# New Campaign");
  assert.deepEqual((await listProjects(root)).map((item) => item.slug), ["new-campaign"]);
});

test("doctor reports missing required project files", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "videos", "broken"), { recursive: true });

  const result = await inspectProject(root, "broken");
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("package.json")));
});

test("render outputs are unique, contained, and validated", async () => {
  const root = path.resolve("workspace");
  const output = defaultRenderPath(root, "campaign", "delivery", new Date("2026-11-11T10:00:00.000Z"));
  assert.equal(isPathInside(path.join(root, "outputs"), output), true);
  assert.match(path.basename(output), /^campaign_delivery_2026-11-11T10-00-00-000Z\.mp4$/);
  assert.throws(() => resolveRenderPath(root, "campaign", "../../escape.mp4"), /filename without directory/);
  assert.throws(() => resolveRenderPath(root, "campaign", "export.mov"), /.mp4 filename/);
  assert.throws(() => defaultRenderPath(root, "campaign", "ultra"), /draft, looks, or delivery/);
});
