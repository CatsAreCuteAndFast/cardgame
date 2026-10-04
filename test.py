import ast
from pathlib import Path

PACKAGES = ("game/core", "game/rules")
ROOT = Path(__file__).parent


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


def test_card_play() -> None:
    from game.core.coord import Coord
    from game.rules.level import make_demo_level
    from game.rules.game_state import GameState
    from game.rules.game_controller import GameController
    from game.rules.intents import ClickedCard, ClickedTile
    from game.rules.view_state import build_view_state, peek_view_state
    from game.rules.phases import Idle, Targeting

    controller = GameController(GameState(make_demo_level()))
    state = controller.game_state
    peek = peek_view_state(state, 0)
    assert peek.preview == (Coord(0, 1), Coord(2, 0), Coord(2, 2)) and controller.phase == Idle(), "peeking must not select"
    assert peek_view_state(state, 3).candidate_cards == (0, 1), "retarget can change the fixed and choose-from cards"
    controller.handle(ClickedCard(0))
    view = build_view_state(state, controller.phase)
    assert view.preview == (Coord(0, 1), Coord(2, 0), Coord(2, 2)), f"fixed flip preview {view.preview}"
    assert view.blocked == () and view.needed == 1
    assert view.candidate_tiles == (Coord(0, 1), Coord(2, 2)), "a fixed card is played by picking one of its tiles"

    controller.handle(ClickedTile(Coord(0, 0)))
    assert controller.phase == Targeting(0), "a tile outside a fixed card is ignored"
    controller.handle(ClickedCard(0))
    assert controller.phase == Idle(), "tapping the selected fixed card again deselects it"

    controller.handle(ClickedCard(2))
    controller.handle(ClickedTile(Coord(0, 2)))
    view = build_view_state(state, controller.phase)
    assert view.blocked == (Coord(0, 2),) and view.preview == (), "notflippable should be blocked"

    controller.handle(ClickedCard(4))
    controller.handle(ClickedTile(Coord(0, 0)))
    view = build_view_state(state, controller.phase)
    assert view.needed == 2 and view.preview == ()

    controller.handle(ClickedCard(0))
    controller.handle(ClickedTile(Coord(2, 2)))
    assert state.plays_remaining == 999 and state.board.get_tile(Coord(2, 0)).is_flipped, "fixed flip should play"


if __name__ == "__main__":
    test_level_dict_roundtrip()
    print("ok: level dict roundtrip")
    test_tester_pack_loads()
    print("ok: tester pack")
    test_editor_manifest_matches_packages()
    print("ok: editor manifest")
    test_card_play()
    print("ok: card play and preview")