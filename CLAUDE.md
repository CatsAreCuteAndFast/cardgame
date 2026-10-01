# CLAUDE.md

A single-player puzzle card game written in Python 3.14 with pygame.
Repo: github.com/CatsAreCuteAndFast/cardgame (branch `main`).

## Keeping this file current (standing instruction)

This file is the project's memory. Keep it up to date:
- After any change to the project, add a dated entry under **Changelog** saying what changed and why. Also update every other section the change affects (mechanics, architecture, conventions, known issues) so the file stays accurate.
- At the start of a session, compare `git log` with the last commit recorded in the Changelog. Record any commits made since then (for example, changes Drifl made without Claude).
- When a known issue is fixed or confirmed as intended, move it out of **Known issues** and note that in the Changelog.

## Response style (standing instruction)

Every reply to Drifl must list all changes made in that turn: files, commits, and git index/state changes. Keep the message as short as possible otherwise.

## Git workflow (standing instruction)

Claude handles git for this project: staging, writing commit messages, and keeping history tidy.
- **Always ask Drifl for permission before running `git commit`.** Never commit without explicit approval, even when a commit seems obvious. Also ask first before pushing, amending, rebasing or any other operation that rewrites history.
- Before asking, show which files will be committed and the proposed message.
- Commit messages: a short lowercase summary line that is specific about what changed (avoid repeating generic messages like "fixed some minor issues"). Add a body when the reason isn't obvious.
- One logical change per commit. Keep generated files out of commits; `.gitignore` covers bytecode, caches, venvs and editor files.
- When a commit is made, record its hash in the matching **Changelog** entry.

## Commands

- Run the game: `python main.py` (demo level) or `python main.py levels/<name>.json`
- Run the tests: `python test.py`. It checks that `game/core` and `game/rules` don't import pygame, that levels survive a dict roundtrip and `levels/demo.json` matches `make_demo_level()`, that the solver gives the expected results on small hand-made levels, and that `editor/modules.json` lists every file in those packages.
- Solve a level: `python solve.py levels/<name>.json [max_states]` prints the fewest plays, how many optimal solutions there are, and one solution.
- Try the editor locally: `python -m http.server` at the repo root, then open `localhost:8000/editor/`.

## Game mechanics

**Core loop:** the player has a hand of cards and a play budget. Playing a card applies its effect to the board, uses one play and ticks every substrate. The level is won when every tile is flipped (`GameState.is_won`), and the phase becomes `Won`. Otherwise, when `plays_remaining` reaches 0, the phase becomes `GameOver`. The debug panel shows plays remaining, game over and won.

**Board** (`game/core`): a W×H grid stored as two flat lists, `tiles` and `substrates`. The index is `width * row + col`, and positions are `Coord(row, col)`.
- `Tile`: `type`, `is_flipped`, `link` (a string group id or None).
- `TileType` registry: `basic`, `notflippable` (`can_flip=False`), `notswappable` (`can_swap=False`).
- `Substrate`: sits under a tile and does **not** move when tiles are swapped. `SubstrateType.period` is 0 for plain (always ready), 1 for oneturn and 2 for twoturn. A tile can be flipped only when its substrate's `counter == 0`. `tick()` counts down and resets to the period after reaching 0, so it cycles.
- Linked tiles: flipping one tile in a link group flips every tile in that group (`Flip._expand`).
- Starting state: `Level.flipped` lists the tiles that start flipped (all others start unflipped). The flipped state belongs to the tile, so it moves when tiles are swapped. A level where every tile starts flipped is rejected as already solved.

**Cards** (`game/rules`): `Card(effect_id, targets: TargetSpec, single_use=False)`.
- Effects:
  - `flip`
  - `swap`: two adjacent tiles, both of which must be swappable.
  - `retarget`: changes another card's targeting.
- Target specs:
  - `Fixed(coords)`: needs 0 picks, so it runs as soon as you enter Targeting.
  - `ChooseFrom(coords)`: pick 1 of the listed coords.
  - `ChooseAny(count)`: pick any `count` tiles.
  - `ChooseAdjacent(count=2)`: each pick must be adjacent to one already picked.
  - `ChooseCard()`: pick a card in the hand.
- Which effect takes which spec (`accepts`): flip takes any tile spec, retarget takes only `ChooseCard`, swap takes only `ChooseAdjacent` with count 2.
- Retarget turns `Fixed` into `ChooseFrom` (and back) with the same coords. It **appends** the result to the hand as a new card with `single_use=True`; the original card stays in the hand.

**Controller phases** (`game_controller.py`, `phases.py`):
1. `Idle`: clicking a card moves to `Selected(index)`.
2. `Selected(index)`: clicking the same card again moves to `Targeting(index, coords, target_index)`.
3. `Targeting(index, coords, target_index)`: the card runs once it has enough picks. Afterwards the phase becomes `Won` if all tiles are flipped, `GameOver` if the budget is used up, and `Idle` otherwise. `Won` and `GameOver` ignore all input.

Clicking anywhere else cancels back to `Idle`. Invalid tile picks are ignored.

**Levels as JSON** (`game/rules/level_io.py`): `level_from_dict`, `level_to_dict` and `load_level(path)`. Format: `{"budget", "tiles": [[id]], "substrates": [[id]], "links": [[[r,c],...]], "flipped": [[r,c],...], "cards": [{"effect", "target": {"kind", ...}, "single_use"?}]}`. Target kinds are `fixed`/`from` (with `coords`), `any`/`adjacent` (with `count`) and `card`. All validation is still `Level.__post_init__`. Level files live in `levels/`.

**Demo level** (`make_demo_level` in `level.py`, and identical in `levels/demo.json`): a 3×3 board, a budget of 1000 plays, and 5 cards: a fixed flip, a choose-from flip, an any-2 flip, a retarget and a swap. It uses mixed tile and substrate types and has one link group, {(0,1), (2,0)}.

## Architecture

**Layers:**
- `game/core`: the board model, with no pygame (`Board`, `Tile`, `TileType`, `Substrate`, `SubstrateType`, `Coord`).
- `game/rules`: the game logic, with no pygame (`Card`, effects, targets, `Level`, `GameState`, `GameController`, phases, intents, `view_state`).
- `game/input/translate.py`: turns a left mouse-button-up event into an `Intent` (`ClickedCard`, `ClickedTile` or `ClickedNothing`).
- `game/view`: pygame layout and rendering. `ScreenLayout` gives the top 5% of the window to the debug panel, the bottom 25% to the hand and the rest to the board.
- `editor/`: the web level editor, plain HTML/CSS/JS with no build step, made for phone, tablet (landscape) and PC use. A single breakpoint at 900px switches to the two-column layout. It is live at https://catsarecuteandfast.github.io/cardgame/editor/, served by GitHub Pages from `main` at the repo root (every push to `main` redeploys) (`.nojekyll` stops Jekyll from dropping `__init__.py`). `editor/rules.js` loads Pyodide (pinned to 314.0.7, which ships Python 3.14, in `PYODIDE_URL`) from jsdelivr, fetches the files listed in `editor/modules.json` from `../game/...` into Pyodide's file system, and imports `editor/bridge.py`. The page and the solver worker (`editor/solver-worker.js`) each load their own copy this way. The worker is a module worker, because Pyodide 314 refuses to run in classic workers. In a worker, `rules.js` imports `pyodide.mjs` instead of `pyodide.js`, and it puts `loadBridge` on `globalThis` so the worker can call it. The bridge is the only interface between JS and the rules. It provides `catalog()` (tile, substrate and effect ids and allowed target kinds, built from the registries), `validate(json)`, and `start`/`tap_tile`/`tap_card`/`tap_nothing`/`undo`/`redo`/`snapshot` for playtesting with the real `GameController`. Undo and redo work per play: the bridge records the intents of each play (a play is complete when `plays_remaining` changes) and rebuilds the game by replaying them from the level, so `GameState` is never copied. Undo also drops a half-made selection, and making a new play clears the redo stack. The solver runs in a Web Worker: `solve_start(json, max_states)` and then `solve_step(seconds)`, which returns `{"status": "running", "states"}` until the result is ready. Each new message starts a new job and stops the previous one between slices. On the Edit screen, every valid change re-solves the level after a 400 ms debounce, with a limit of 50,000 positions (`SOLVER_MAX_STATES`). The solver panel under the validation line shows the fewest plays, how many optimal solutions there are, and the steps. "Step through" loads the solution into Play with `start_solution(json, moves)`, which fills the redo stack so that Redo plays one step at a time. Levels are stored in that browser's `localStorage`: `cardgame.levels` (each has `id`, `name`, `folder` (folder id or null), `updated`, `data`) and `cardgame.folders` (`id`, `name`, `collapsed`). Optional sync between devices goes through a secret GitHub gist holding `cardgame-levels.json` (`{version: 1, updated, levels, folders}`), called straight from the browser. The Sync dialog takes a gist-scoped token and a gist id; a blank id creates the gist from this device's levels. Each device keeps `cardgame.sync` (`token`, `gistId`, `remoteUpdated`, `dirty`); the token never leaves that browser except to api.github.com. The editor pulls on load and whenever the tab becomes visible, and pushes about 2 s after a change to levels or folders (and when the tab is hidden). A push first re-reads the gist. If the gist's `updated` differs from `remoteUpdated` while this device also has unsynced edits, a confirm asks which side wins; there is no merging. `localStorage` stays the working copy, so offline edits push later. The open level (`cardgame.current`) is per device and not synced. Folders are one level deep. The Levels screen sorts folders and levels by name with natural ordering, so "Level 2" comes before "Level 10". Deleting a folder moves its levels to Ungrouped. "Copy JSON" exports one level in the same compact layout as `levels/demo.json`. "Copy all" and a folder's "Copy" export `[{name, folder?, level}]`, and "Import JSON" accepts that list (recreating folders by name) or a single level.

**Solver** (`game/rules/solver.py`): `solve(level, max_states)` returns `Solved(steps, solutions, counted_all, states)`, `Unsolvable(reason, states)` or `GaveUp(searched, states)`. `search_level` is the same search as a generator that yields the number of positions seen so far, so the editor can run it in slices. How it works:
- It first rejects levels that clearly can't be won: no flip card, or an unflipped notflippable tile with no flippable tile in its link group.
- Otherwise it runs a layered breadth-first search, one layer per play, so the first win it finds uses the fewest plays. Every move is played through a real `GameController` (via its intents) on a copy of the state (`GameState.copy`, `Board.copy`, `Tile.copy`, `Substrate.copy`), so the solver always follows the real rules.
- Moves are every distinct card in the hand combined with every distinct set of picks that `is_candidate` and `can_target` allow (or every card that can be retargeted).
- A position's key is made of the tile codes in board order (bytes), the substrate counters, the set of persistent cards and the counts of single-use cards. Only keys are stored, and a position is rebuilt from its key when it is expanded.
- `solutions` counts the different sequences of positions that win in the fewest plays. `counted_all` is false if the state limit was hit partway through that last layer.
- The solution is replayed from the start of the level to produce the real hand indices (`Step.intents`); the solver raises if that replay does not win.
- Retarget can grow the hand without end, so levels with a retarget card and a large budget can usually only end in `GaveUp` ("no solution in N plays or fewer") rather than a proof that there is no solution.

**Per-frame flow** (`main.py`): event → `translate` → `controller.handle(intent)` → `build_view_state(state, phase)` → `GameRenderer.draw`.
- `ViewState` is the only bridge from rules to view. It carries the candidate tiles and cards (for highlighting), the picked tiles, the selected card, whether targeting is active, and whether the game is over.
- Layouts are rebuilt every frame and again after each intent, because the hand size can change.

**Conventions:**
- Use frozen dataclasses for value types. Type ids are looked up in a module-level `_REGISTRY` dict through a `get_x(id)` function, and listed with `x_ids()` (`tile_type_ids`, `substrate_type_ids`, `effect_ids`); the editor builds its palettes from these.
- Adding or removing a module in `game/core` or `game/rules` means updating `editor/modules.json` (`test.py` fails until it matches).
- Unions use PEP 695 (`type X = A | B`). Dispatch with `match`, and end every match with `case _: raise ValueError(...)`.
- Type hints everywhere, no docstrings, very few comments.
- Level data is tuples of string ids. `Level.__post_init__` validates it, and `make_board()` builds the `Board`.

**Adding a new effect** means updating:
- the effect class and `_REGISTRY`
- `can_modify`, `accepts` and `can_target` in `effects.py`
- `_execute` in `game_controller.py`
- `_impossible` in `solver.py` if it changes which tiles can ever be flipped
- the editor picks it up automatically through `catalog()`; check `_SAMPLE_TARGETS` in `editor/bridge.py` if it needs new target params

**Adding a new TargetSpec** means updating:
- `describe`, `required_coords` and `is_candidate` in `targets.py`
- `_handle_targeting`, `_try_execute` and `_resolve_coords` in `game_controller.py`
- `_candidates` in `view_state.py`
- `_moves` in `solver.py`
- `_check_targets` in `level.py`
- `TARGET_KINDS`, `target_from_dict` and `target_to_dict` in `level_io.py`
- `_SAMPLE_TARGETS` in `editor/bridge.py`, and `KIND_LABELS`/`defaultTarget`/the card details UI in `editor/editor.js`

## History (up to commit 65d23f6, 2026-09-26)

1. Working board, then the pygame board display, a layout that adapts to window resizing, and clicking tiles to flip them.
2. Cards and the hand GUI. The layout and renderer classes were merged, then `GameState` and `GameController` were added.
3. Upgraded the test environment (added the no-pygame layering test).
4. The retarget effect and game phases, then the swap card, `ChooseAdjacent` targeting and notswappable tiles.
5. Smoothed card and tile edges, then added the `ViewState` bridge, the debug panel and effects for game events.
6. Linked tiles, then tile text that shows links.
7. Substrates: the data first, then the behaviour, then a fix so that Fixed-target flips respect substrates, then the substrate GUI.
8. Changed flip behaviour and highlighting, followed by four small cleanup commits.

## Known issues / loose ends (not yet confirmed as intended)

- `Flip._expand` checks `_flip_allowed` only on the clicked coord. The other tiles in its link group flip even if they are notflippable or their substrate is not ready.
- `can_target(Flip)` always returns True, so a blocked tile can still be picked. The flip then does nothing but still uses up a play. This may be the intended "changed flip behaviour" from commit 5ce40f2.
- `SIZE` and `TEST_TILE_LIST` in `level.py` are unused.
- Retarget appends a new card instead of replacing the targeted one, so the hand keeps growing.
- The demo level (`make_demo_level`/`levels/demo.json`) can't be won: (0,2) and (2,1) are notflippable and not linked.

## Changelog

Newest first. Each entry gives the date, the commit (if committed) and what changed.

- **2026-10-01** (uncommitted): fixed the editor's "Solver error: Failed to execute 'importScripts'…". Pyodide 314 doesn't support classic workers, so `solver-worker.js` is now a module worker (`{ type: "module" }`, `import "./rules.js"`), and `rules.js` loads `pyodide.mjs` with a dynamic import when there is no `document`.
- **2026-10-01** (9f9aa4f): level solver. Added `game/rules/solver.py`: a breadth-first search that finds the fewest plays, counts the optimal solutions, and reports levels that are unsolvable or too large to search. Also added `copy()` to `Board`, `Tile`, `Substrate` and `GameState`, `solve.py` for the command line, and a solver test in `test.py`. In the editor, the level is solved automatically in a Web Worker after each edit, a solver panel shows the result and steps, and "Step through" loads the solution into Play's redo stack. The Pyodide loading code moved from `editor.js` into `editor/rules.js` so the worker can share it; the Pyodide `<script>` tag was removed from `index.html`. The demo level turns out to be unsolvable, because tiles (0,2) and (2,1) are notflippable and not linked.
- **2026-10-01** (9d37063): Undo and Redo buttons on the editor's Play screen, one play per step. Added `undo`/`redo` and `can_undo`/`can_redo` in the snapshot to `editor/bridge.py`, which replays recorded intents from the start of the level.
- **2026-10-01** (a661c70): editor levels can sync across devices through a secret GitHub gist (one user, so there is no server). Added a Sync button and dialog (token and gist id; a blank id creates the gist), a sync status in the header, pull on load and on tab focus, a debounced push with a conflict prompt, and the `cardgame.sync` key. `saveLevels()` now only marks sync dirty when levels or folders actually changed (not when only the open level changed).
- **2026-10-01** (3f3f204): levels can now have tiles that start flipped. Added `Level.flipped` (a coord tuple, validated for bounds and duplicates, and rejected if every tile is flipped), used by `make_board`. Added the `flipped` key to the JSON format (optional when loading; `levels/demo.json` now has `"flipped": []`), a roundtrip test for it, and a "Flipped" paint mode in the editor, where older saved levels get `flipped: []`. The editor's mode buttons now size to their labels so four fit on a phone. Also noted the live editor URL in the Architecture section.
- **2026-10-01** (0ac1020): level folders in the editor (one level deep). Added New folder, per-folder "+ Level"/Rename/Copy/delete/collapse, a Move dialog per level, and folder names in "Copy all"/import. Levels are now sorted by name instead of last edited. Also fixed the open level's card in the list picking up the header's `.current` text style.
- **2026-10-01** (25a4301): editor layout for tablet landscape and PC. At 900px and wider, Edit and Play use two columns (board on the left, sized to fit the window height and sticky; controls, cards and hand on the right). Number inputs no longer show browser spinners (they clipped the values), cell text is capped in size, and mouse hover states were added. The phone layout is unchanged apart from tidier steppers.
- **2026-10-01**: recorded the hashes of the four editor commits below (committed on its own right after them).
- **2026-10-01** (d759cbf json loader, 8d50041 level file argument, 6c234ab win condition, f75d8f8 editor): web level editor for phone/tablet. Added `game/rules/level_io.py` (JSON level format and loader), `x_ids()` registry listing functions, `levels/demo.json`, and `main.py` now takes an optional level path. Added the win condition: all tiles flipped leads to the new `Won` phase (`GameState.is_won`, `ViewState.won`, debug panel line); this resolves the "no win condition" known issue. Added `editor/` (index.html, editor.css, editor.js, bridge.py, modules.json) and `.nojekyll`. `test.py` gained the roundtrip, demo.json and manifest checks. Small changes: the substrate registry order is now plain, oneturn, twoturn (sets the palette order), and the `accepts` error in `Level._check_cards` now names the card index and effect id instead of an object repr.
- **2026-10-01** (f75d8f8): added the Response style section (list all changes, keep replies short). Also recorded commit hashes 10a5de3 and fabce7d in this changelog.
- **2026-10-01** (10a5de3): added `.gitignore` (bytecode, tool caches, venvs, editor/OS files, `.claude/settings.local.json`). Removed all tracked `__pycache__/*.pyc` files from the index, including the stale root `__pycache__`; they stay on disk but are ignored. This resolves the "pycache tracked" known issue. Also added the Git workflow section: Claude handles git and must ask before committing.
- **2026-10-01** (fabce7d): added `CLAUDE.md`, which documents the project as of commit 65d23f6. Also added the standing instruction to keep this file current.
