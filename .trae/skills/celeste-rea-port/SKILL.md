---
name: celeste-rea-port
description: Reverse engineer local Celeste managed assemblies with REA and port player state machines into the blog-ui engine using its atlases frames. Use when porting Celeste movement behavior, verifying constants or frame data, or auditing the engine against the original. Do not use for downloading source repos or general web research.
---

# Celeste REA → Blog-UI Port

Port original Celeste player behavior into the project engine with binary evidence. Every behavioral change must trace to a decompiled method or field, and every rendered frame must come from the project atlases.

## Non-negotiables

- Decompile **local installed files only**. Primary target is `C:\Program Files (x86)\Steam\steamapps\common\Celeste\Celeste.dll`. Never substitute a GitHub source repo, wiki, or blog as the authority for behavior.
- Do not call this skill's body "install REA". If REA tools are absent, follow the `reverse-engineer-anything` skill's recovery path and keep working with whatever evidence is available.
- Do not invent evidence. Every constant, condition, or ordering claim cites the assembly, type, and member. Unresolved items go in an explicit gaps list, never as a guess presented as fact.
- Rendering assets come from the project's `blog-ui\Atlases\` library only. Locate the needed frames by searching that tree; never by downloading art or hand-drawing substitutes.

## Fixed paths

| Purpose | Path |
|---|---|
| Local game binaries | `C:\Program Files (x86)\Steam\steamapps\common\Celeste\` (`Celeste.dll`, `Celeste.Content.dll`, `Celeste.Mod.mm.dll`, `MMHOOK_Celeste.dll`) |
| Engine | `blog-ui\js\celeste-character.js` |
| Hair colors | `blog-ui\js\celeste-hair.js` |
| Demo / geometry | `blog-ui\celeste-character-demo.html` |
| Asset library (single search domain) | `blog-ui\Atlases\` — 8375 PNGs across 22 top-level folders (`Gameplay`, `Overworld`, `Mountain`, `Portraits`, …) |
| Player frame art (confirmed) | `blog-ui\Atlases\Gameplay\characters\player\` and its `sweat\` subfolder; variants `player_badeline\`, `player_no_backpack\`, `player_playback\`; `badeline\` |
| Research record | `celeste-dash-反编译研究.md` (13 chapters; chapter 10 is the deviation worksheet) |
| Acceptance URL | `http://localhost:8080/celeste-character-demo.html` (server root = `blog-ui`) |

## Step 1 — Establish evidence from the local assembly

`Celeste.dll` is a managed PE/CLI assembly, so route with `inspect_managed_artifact`. Do not use native Ghidra or `analyze_javascript_application` on it.

1. Enumerate types and locate `Celeste.Player` plus its state classes (`Celeste.Player`, `Celeste.PlayerStates` partials such as `StNormal`, `StClimb`, `StDash`).
2. For each state method (`NormalUpdate`, `ClimbUpdate`, `DashUpdate`, `NormalBegin`, `ClimbBegin`, `DashBegin`, `Update`), pull the method signature, constants, and the exact branch order.
3. Extract constant fields verbatim before reading logic: `MaxRun`, `RunAccel`, `RunReduce`, `MaxFall`, `FastMaxFall`, `Gravity`, `JumpSpeed`, `WallJumpHSpeed`, `ClimbUpSpeed`, `ClimbDownSpeed`, `ClimbHopX/Y`, `DashSpeed`, `EndDashSpeed`, `DashTime`, `DashCooldown`, `FreezeTimer` semantics, `DashCornerCorrection`, `DuckSuperJumpXMult`, and neighbors.
4. Note conditional ordering that changes behavior, not just values — e.g. whether wall grabbing requires `onGround`, whether climbing exits on landing, when `onGround` is recomputed, whether dash velocity is assigned one frame after `DashBegin`.
5. Record gaps: names not found, overloads skipped, IL not fully resolved. State them as gaps.

Deliverable of this step is evidence text in the research file, organized per state, each claim tied to a member.

## Step 2 — Write the deviation worksheet

Convert evidence into an actionable list before editing code. Keep the existing format, one row per deviation:

| ID | Original behavior (member + condition) | Current engine behavior | Required change |
|---|---|---|---|
| D1 | ... | ... | ... |

Rules:
- One deviation per row, each independently verifiable.
- Order rows by execution path, because early-fixed bugs mask later ones.
- Do not merge "refactor" items into the list; only behavior gaps belong here.

## Step 3 — Port into the engine

Edit `blog-ui\js\celeste-character.js` in place. Do not create a parallel engine file.

- Keep the unit convention: 1 engine unit = 1 original pixel, y axis down.
- Keep state ids `ST_NORMAL = 0`, `ST_CLIMB = 1`, `ST_DASH = 2`, and route every state transition through `update()` so the external input contract stays stable: `{ left, right, down, up, jumpHeld, jumpPressed, grabHeld, grabPressed, dashPressed }`.
- Name constants after the original fields (`MAX_RUN`, `CLIMB_UP_SPEED`, `DASH_CORNER_CORRECTION`), so a future diff against the assembly stays cheap.
- Mirror original ordering literally. When the original assigns velocity on the next frame, or recomputes `onGround` at frame start, copy that sequence instead of "cleaning it up".
- Preserve existing hair semantics: `celeste-hair.js` supplies five prerendered palettes; state changes only pick a palette, they never recolor pixels per frame.
- Change the minimum needed to close worksheet rows. No opportunistic refactors in the same pass.

## Step 4 — Drive frames from the atlases library

`blog-ui\Atlases\` is one large asset library, not a single player folder. Treat the whole tree as the search domain: frame art for any animation is located by searching it, then confirmed before wiring.

1. Discover, do not assume. Search the tree for the animation name with a numeric suffix, e.g. Glob `blog-ui/Atlases/**/climb*.png` or `**/dash*.png`. A hit set tells you both the directory and the true frame count.
2. Confirm every index. Frame files are zero-padded numbered PNGs (`climb00.png` … `climb14.png`). Animation table entries in `ANIMS` declare `path`, `delay`, `frames` (file indices, not array offsets), and `goto`/`loop`. Never reference an index without a matching file on disk.
3. Pick the right directory. Several folders hold the same animation for different actors or states — `Gameplay\characters\player`, `player\sweat`, `player_badeline`, `player_no_backpack`, `player_playback`, `badeline`. Choose by the variant you are rendering and pass it as the `base` option, e.g. `base: 'Atlases/Gameplay/characters/player'`. Do not mix frames from two directories in one animation.
4. Record the verified counts. Confirmed in the current library: `climb` 15 (00–14), `dash` 4, `idle` 9, `idleA`/`idleC` 12, `idleB` 24, `flip` 9, `runSlow`/`runFast` 12, `jumpSlow`/`jumpFast` 4, `lookUp` 8, `duck` 1, `tired` 4, `sweat\climb` 8. If a glob returns a different count, trust the glob and update `ANIMS`.
5. Hair offsets come from the per-frame `HAIR` table keyed by animation path; a missing entry means hair hidden. Add entries only when a frame genuinely has no hair metadata.
6. Keep `image-rendering: pixelated` scaling in the demo; do not smooth-upscale.

## Step 5 — Assert numerically in a Node vm sandbox

Behavior is verified by numbers, not by eyeballing the canvas. Load the engine outside the browser:

```js
const fs = require('fs');
const vm = require('vm');
const sandbox = { window: {}, Image: function () { return { onload: null, src: '' }; } };
vm.runInNewContext(fs.readFileSync('blog-ui/js/celeste-hair.js', 'utf8'), sandbox);
vm.runInNewContext(fs.readFileSync('blog-ui/js/celeste-character.js', 'utf8'), sandbox);
```

Harness requirements:
- Mock `Image` so `loadImage` resolves without network, and stub `CelesteHair` if the engine reads palettes at construction.
- Rebuild the same solid-block geometry the demo uses (`groundAt`, `wallNearAt`, `wallCollidesAt`) so collision results match the browser.
- Drive fixed `dt` steps and assert exact values: dash speed, freeze frame count, cooldown windows, stamina drain rate, wall-jump horizontal speed, leap/climb-hop impulse, landing transitions.
- Print `passed/total` and exit non-zero on failure. Run with `node <script>.js` and keep the script outside the repo (temp dir) unless the user asks to commit tests.

## Step 6 — Demo acceptance

1. Bump the script cache-buster in `celeste-character-demo.html` (currently `?v=5`, increment on every engine edit).
2. Load `http://localhost:8080/celeste-character-demo.html`; confirm no console errors, frames render from atlases, and each fixed worksheet row is observable.
3. Report the numbers from Step 5 alongside the visual result. A visual pass with failing assertions is not a pass.

## Update the research record

Append evidence and worksheet status to `celeste-dash-反编译研究.md`. Mark rows fixed only after Step 5 assertions pass. New unresolved findings re-enter the worksheet, not the prose.

## Prohibited

- Citing online source repositories, mod wikis, or fan decompilations as behavior authority when local binaries exist.
- Treating the game's shipped content packs or third-party mods as the player-logic target.
- Fabricating constants, frame counts, or IL details to fill a gap.
- Loading sprite art from anywhere outside `blog-ui\Atlases`.
- Assuming a frame path instead of searching the atlases tree, or wiring an animation index whose PNG does not exist.
- Declaring a port complete without numeric assertions and a cache-buster bump.
