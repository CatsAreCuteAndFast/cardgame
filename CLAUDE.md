# CLAUDE.md

A single-player puzzle card game written in Python 3.14 with pygame.
Repo: github.com/CatsAreCuteAndFast/cardgame (branch `main`).

## Keeping this file current (standing instruction)

This file is the project's memory. Keep it up to date:
- After any change to the project, add a dated entry under **Changelog** saying what changed and why. Also update every other section the change affects (mechanics, architecture, conventions, known issues) so the file stays accurate.
- At the start of a session, compare `git log` with the last commit recorded in the Changelog. Record any commits made since then (for example, changes Drifl made without Claude).
- When a known issue is fixed or confirmed as intended, move it out of **Known issues** and note that in the Changelog.

## Git workflow (standing instruction)

Claude handles git for this project: staging, writing commit messages, and keeping history tidy.
- **Always ask Drifl for permission before running `git commit`.** Never commit without explicit approval, even when a commit seems obvious. Also ask first before pushing, amending, rebasing or any other operation that rewrites history.
- Before asking, show which files will be committed and the proposed message.
- Commit messages: a short lowercase summary line that is specific about what changed (avoid repeating generic messages like "fixed some minor issues"). Add a body when the reason isn't obvious.
- One logical change per commit. Keep generated files out of commits; `.gitignore` covers bytecode, caches, venvs and editor files.
- When a commit is made, record its hash in the matching **Changelog** entry.

## Commands

- Run the game: `python main.py`
- Run the test: `python test.py`. It is an architecture check that fails if `game/core` or `game/rules` imports pygame.

## Game mechanics

**Core loop:** the player has a hand of cards and a play budget. Playing a card applies its effect to the board, uses one play and ticks every substrate. When `plays_remaining` reaches 0 the phase becomes `GameOver`. There is no win condition yet; the debug panel shows plays remaining and whether the game is over.

**Board** (`game/core`): a W×H grid stored as two flat lists, `tiles` and `substrates`. The index is `width * row + col`, and positions are `Coord(row, col)`.
- `Tile`: `type`, `is_flipped`, `link` (a string group id or None).
- `TileType` registry: `basic`, `notflippable` (`can_flip=False`), `notswappable` (`can_swap=False`).
- `Substrate`: sits under a tile and does **not** move when tiles are swapped. `SubstrateType.period` is 0 for plain (always ready), 1 for oneturn and 2 for twoturn. A tile can be flipped only when its substrate's `counter == 0`. `tick()` counts down and resets to the period after reaching 0, so it cycles.
- Linked tiles: flipping one tile in a link group flips every tile in that group (`Flip._expand`).

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
3. `Targeting(index, coords, target_index)`: the card runs once it has enough picks. Afterwards the phase returns to `Idle`, or to `GameOver` if the budget is used up.

Clicking anywhere else cancels back to `Idle`. Invalid tile picks are ignored.

**Demo level** (`make_demo_level` in `level.py`): a 3×3 board, a budget of 1000 plays, and 5 cards: a fixed flip, a choose-from flip, an any-2 flip, a retarget and a swap. It uses mixed tile and substrate types and has one link group, {(0,1), (2,0)}.

## Architecture

**Layers:**
- `game/core`: the board model, with no pygame (`Board`, `Tile`, `TileType`, `Substrate`, `SubstrateType`, `Coord`).
- `game/rules`: the game logic, with no pygame (`Card`, effects, targets, `Level`, `GameState`, `GameController`, phases, intents, `view_state`).
- `game/input/translate.py`: turns a left mouse-button-up event into an `Intent` (`ClickedCard`, `ClickedTile` or `ClickedNothing`).
- `game/view`: pygame layout and rendering. `ScreenLayout` gives the top 5% of the window to the debug panel, the bottom 25% to the hand and the rest to the board.

**Per-frame flow** (`main.py`): event → `translate` → `controller.handle(intent)` → `build_view_state(state, phase)` → `GameRenderer.draw`.
- `ViewState` is the only bridge from rules to view. It carries the candidate tiles and cards (for highlighting), the picked tiles, the selected card, whether targeting is active, and whether the game is over.
- Layouts are rebuilt every frame and again after each intent, because the hand size can change.

**Conventions:**
- Use frozen dataclasses for value types. Type ids are looked up in a module-level `_REGISTRY` dict through a `get_x(id)` function.
- Unions use PEP 695 (`type X = A | B`). Dispatch with `match`, and end every match with `case _: raise ValueError(...)`.
- Type hints everywhere, no docstrings, very few comments.
- Level data is tuples of string ids. `Level.__post_init__` validates it, and `make_board()` builds the `Board`.

**Adding a new effect** means updating:
- the effect class and `_REGISTRY`
- `can_modify`, `accepts` and `can_target` in `effects.py`
- `_execute` in `game_controller.py`

**Adding a new TargetSpec** means updating:
- `describe`, `required_coords` and `is_candidate` in `targets.py`
- `_handle_targeting`, `_try_execute` and `_resolve_coords` in `game_controller.py`
- `_candidates` in `view_state.py`
- `_check_targets` in `level.py`

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
- There is no win condition or goal state; `GameOver` only means the budget ran out.
- `SIZE` and `TEST_TILE_LIST` in `level.py` are unused.
- Retarget appends a new card instead of replacing the targeted one, so the hand keeps growing.

## Changelog

Newest first. Each entry gives the date, the commit (if committed) and what changed.

- **2026-10-01** (uncommitted): added `.gitignore` (bytecode, tool caches, venvs, editor/OS files, `.claude/settings.local.json`). Removed all tracked `__pycache__/*.pyc` files from the index, including the stale root `__pycache__`; they stay on disk but are ignored. This resolves the "pycache tracked" known issue. Also added the Git workflow section: Claude handles git and must ask before committing.
- **2026-10-01** (uncommitted): added `CLAUDE.md`, which documents the project as of commit 65d23f6. Also added the standing instruction to keep this file current.
