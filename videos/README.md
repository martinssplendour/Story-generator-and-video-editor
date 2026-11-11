# Video projects

Each child directory is an independent, editable HyperFrames project.

Tracked project source includes:

- `BRIEF.md` and `STORYBOARD.md`
- `index.html` and `compositions/`
- `package.json`, `hyperframes.json`, and project metadata
- Reusable styles and approved source assets needed for rendering

Generated `renders/`, `snapshots/`, `.thumbnails/`, `.waveform-cache/`, `.hyperframes/`, and `capture/` directories are ignored. Final exports belong under the repository-level `outputs/<project>/` directory.

Use the root commands instead of manually changing directories:

```powershell
npm run video:doctor -- project-slug
npm run video:check -- project-slug
npm run video:preview -- project-slug
npm run video:render -- project-slug --approved --quality delivery
```
