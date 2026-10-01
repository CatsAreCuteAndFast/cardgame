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


def test_editor_manifest_matches_packages() -> None:
    import json

    listed = json.loads((ROOT / "editor/modules.json").read_text())
    actual = ["game/__init__.py"] + sorted(
        str(path.relative_to(ROOT)) for package in PACKAGES for path in (ROOT / package).glob("*.py")
    )
    assert listed == actual, f"editor/modules.json is out of date, expected {actual}"


if __name__ == "__main__":
    test_no_pygame_in_logic_layers()
    print("ok: no pygame in", ", ".join(PACKAGES))
    test_level_dict_roundtrip()
    print("ok: level dict roundtrip")
    test_editor_manifest_matches_packages()
    print("ok: editor manifest")