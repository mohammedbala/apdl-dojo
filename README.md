# APDL Dojo

A gamified trainer that makes you fast at ANSYS Mechanical APDL, all the way to building a
turbine-generator flexible tabletop foundation from scratch with four different modelling techniques.

**Play:** https://mohammedbala.github.io/apdl-dojo/

You type APDL in the browser. An in-browser APDL interpreter builds the model, a Three.js viewport
renders it next to the target, and a grader checks geometry, attributes, mesh and loads as you type.
No install, no licence, no backend: progress is stored in your browser and can be exported as JSON.

## Modes

| Mode | What it trains |
|---|---|
| **Tracks** | Ten technique tracks with short lessons and graded build challenges. Forbidden-command rules force the technique (no `BLOCK` in the bottom-up track, no `K/L/A/V` in the primitives track). |
| **Drills** | Monkeytype-style command typing: a prompt like "Create keypoint 5 at (2, 0, 3)", you type `K,5,2,,3`. Tracks commands per minute, accuracy and your weakest commands. |
| **Flashcards** | Command ⇄ meaning recall with Leitner spaced repetition. |
| **Daily** | One randomised challenge per day with fresh dimensions. Keeps your streak alive. |
| **Speedrun** | The full TGF-36 tabletop foundation from a blank editor, with LiveSplit-style splits for geometry, attributes, mesh and loads, and a local leaderboard. |
| **Error hunt** | Broken scripts that produce real-looking ANSYS warnings: fix them against the clock. |
| **Sandbox** | Free play with the four reference foundation models preloaded. |

Progression: XP and twelve levels from *Keypoint Cadet* to *Foundation Architect*, 30 achievements,
star ratings against par time and par line count, a skill radar per track, and a stats page with a
per-command accuracy heatmap.

## The boss model: TGF-36

| Part | Size (m) |
|---|---|
| Base mat | 38 × 14 × 3 |
| Columns | 8 × (2 × 3), z 3 → 11 |
| Deck | 36 × 12 × 3 at z 11 → 14, two 6 × 5 openings |
| Bearings | MASS21 80 / 150 / 150 / 120 t at x 4, 14, 24, 34 |

The same foundation is built four ways in [`models/reference`](models/reference):
A primitives + Booleans, B bottom-up, C extrude/drag, and D an idealised beam/shell/spring frame on
Winkler springs. A, B and C produce identical models (10 glued volumes, 3096 m³, 3318 SOLID185).

## How it works

- `src/apdl` — lexer, expression parser, control flow (`*DO`, `*IF`, `*GET`) and ~250 command handlers.
- `src/geometry` — B-rep kernel: keypoints, lines, areas, volumes, sweeps, copies; Booleans through
  [manifold-3d](https://github.com/elalish/manifold) (WASM) with the B-rep rebuilt from tagged faces; planar imprinting for `VGLUE`.
- `src/mesh` — structured hex mesher for glued axis-aligned volumes, sweep mesher for prisms and
  `VROTAT`/`VDRAG` volumes, 2-D mapped/grid/Delaunay area mesher, line and point meshing.
- `src/grader` — compares your model with the target by stage.
- `src/render` — Three.js viewport with Target / Yours / Split / Ghost modes, `/PNUM` labels, `/ESHAPE`, BC glyphs.
- `src/pages`, `src/game`, `src/content` — the game: pages, XP and achievements, lessons and challenges.

What the interpreter supports, and what it deliberately mimics from ANSYS, is documented in
[`docs/interpreter-scope.md`](docs/interpreter-scope.md). There is no solver: `SOLVE` runs model checks only.

## Develop

```bash
npm install
```

```bash
npm run dev
```

```bash
npm test
```

Every challenge is validated by the test suite: its target must build without errors and its reference
solution must grade as a full match within par. The GitHub Actions workflow runs typecheck, tests and
build, then deploys to GitHub Pages on every push to `main`.

ANSYS and Mechanical APDL are trademarks of ANSYS, Inc. This is an independent training tool and is
not affiliated with or endorsed by ANSYS, Inc.

## License

MIT
