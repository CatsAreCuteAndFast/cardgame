import ast
from pathlib import Path

FORBIDDEN = "pygame"
PACKAGES = ("game/core", "game/rules")
ROOT = Path(__file__).parent


def _imported_roots(path: Path) -> set[str]:
    """Top-level package name of every module this file imports."""
    tree = ast.parse(path.read_text(), filename=str(path))
    roots: set[str] = set()
    for node in ast.walk(tree):
        match node:
            case ast.Import(names=names):
                roots.update(alias.name.split(".")[0] for alias in names)
            case ast.ImportFrom(module=str() as module, level=0):
                roots.add(module.split(".")[0])
    return roots


def test_no_pygame_in_logic_layers() -> None:
    for package in PACKAGES:
        for path in sorted((ROOT / package).glob("*.py")):
            assert FORBIDDEN not in _imported_roots(path), (
                f"{path.relative_to(ROOT)} imports {FORBIDDEN}"
            )


def test_level_dict_roundtrip() -> None:
    from game.rules.level import make_demo_level
    from game.rules.level_io import level_from_dict, level_to_dict, load_level
    from game.core.coord import Coord

    level = make_demo_level()
    assert level_from_dict(level_to_dict(level)) == level
    assert load_level(ROOT / "levels/demo.json") == level, "levels/demo.json differs from make_demo_level()"

    data = level_to_dict(level) | {"flipped": [[0, 0], [1, 2]]}
    flipped_level = level_from_dict(data)
    assert level_to_dict(flipped_level) == data
    board = flipped_level.make_board()
    assert [coord for coord, tile in board.iterate_tiles() if tile.is_flipped] == [Coord(0, 0), Coord(1, 2)]

    data = level_to_dict(level) | {"counters": [[1, 1, 0], [1, 2, 1]]}
    counter_level = level_from_dict(data)
    assert level_to_dict(counter_level) == data
    board = counter_level.make_board()
    assert [board.get_substrate(Coord(1, c)).counter for c in range(3)] == [0, 0, 1]
    assert board.get_substrate(Coord(2, 1)).counter == 1
    for bad in ([[1, 1, 2]], [[0, 0, 1]], [[1, 1, 0], [1, 1, 1]], [[5, 5, 0]]):
        try:
            level_from_dict(level_to_dict(level) | {"counters": bad})
        except ValueError:
            continue
        raise AssertionError(f"counters {bad} should be rejected")


def test_tester_pack_loads() -> None:
    import json
    from game.rules.level_io import level_from_dict

    pack = json.loads((ROOT / "levels/pack.json").read_text())
    assert isinstance(pack, list), "levels/pack.json should be a list"
    for entry in pack:
        assert isinstance(entry, dict) and isinstance(entry.get("name"), str) and "level" in entry, f"bad pack entry {entry!r}"
        try:
            level_from_dict(entry["level"])
        except (ValueError, KeyError, TypeError) as error:
            raise AssertionError(f"pack level {entry['name']!r} is invalid: {error}") from error


def test_editor_manifest_matches_packages() -> None:
    import json

    listed = json.loads((ROOT / "editor/modules.json").read_text())
    actual = ["game/__init__.py"] + sorted(
        str(path.relative_to(ROOT)) for package in PACKAGES for path in (ROOT / package).glob("*.py")
    )
    assert listed == actual, f"editor/modules.json is out of date, expected {actual}"


def test_preview() -> None:
    from game.core.coord import Coord
    from game.rules.level import make_demo_level
    from game.rules.game_state import GameState
    from game.rules.game_controller import GameController
    from game.rules.intents import ClickedCard, ClickedTile
    from game.rules.view_state import build_view_state, hover_preview

    controller = GameController(GameState(make_demo_level()))
    state = controller.game_state
    controller.handle(ClickedCard(0))
    view = build_view_state(state, controller.phase)
    assert view.preview == (Coord(0, 1), Coord(2, 0), Coord(2, 2)), f"fixed flip preview {view.preview}"
    assert view.blocked == () and view.needed == 0

    assert hover_preview(state, controller.phase, 2, Coord(0, 2)) == ((), (Coord(0, 2),)), "notflippable should be blocked"
    assert hover_preview(state, controller.phase, 4, Coord(1, 1)) == ((), ()), "notswappable can't be picked"

    controller.handle(ClickedCard(4))
    controller.handle(ClickedTile(Coord(0, 0)))
    view = build_view_state(state, controller.phase)
    assert view.needed == 2 and view.preview == ()
    assert hover_preview(state, controller.phase, 4, Coord(1, 0)) == ((Coord(0, 0), Coord(1, 0)), ())


if __name__ == "__main__":
    test_no_pygame_in_logic_layers()
    print("ok: no pygame in", ", ".join(PACKAGES))
    test_level_dict_roundtrip()
    print("ok: level dict roundtrip")
    test_tester_pack_loads()
    print("ok: tester pack")
    test_editor_manifest_matches_packages()
    print("ok: editor manifest")
    test_preview()
    print("ok: preview")