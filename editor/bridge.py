import json
import time
from collections.abc import Generator
from typing import Any
from game.core.coord import Coord
from game.core.tiletype import get_tile_type, tile_type_ids
from game.core.substratetype import get_substrate_type, substrate_type_ids
from game.rules.effects import get_effect, effect_ids, accepts
from game.rules.level_io import level_from_dict, target_from_dict, TARGET_KINDS
from game.rules.game_state import GameState
from game.rules.game_controller import GameController
from game.rules.intents import Intent, ClickedCard, ClickedTile, ClickedNothing
from game.rules.view_state import build_view_state
from game.rules.solver import search_level, Solved, Unsolvable, GaveUp, SolveResult, Move, Step

_SAMPLE_TARGETS: dict[str, dict[str, Any]] = {
    "fixed": {"kind": "fixed", "coords": []},
    "from": {"kind": "from", "coords": []},
    "any": {"kind": "any", "count": 1},
    "adjacent": {"kind": "adjacent", "count": 2},
    "card": {"kind": "card"},
}

_controller: GameController | None = None
_level: dict[str, Any] = {}
_moves: list[list[Intent]] = []
_redo: list[list[Intent]] = []
_pending: list[Intent] = []
_search: Generator[int, None, SolveResult] | None = None

def catalog() -> str:
    return json.dumps({
        "tiles": [
            {"id": id, "can_flip": get_tile_type(id).can_flip, "can_swap": get_tile_type(id).can_swap}
            for id in tile_type_ids()
        ],
        "substrates": [{"id": id, "period": get_substrate_type(id).period} for id in substrate_type_ids()],
        "effects": [
            {"id": id, "kinds": [kind for kind in TARGET_KINDS if accepts(get_effect(id), target_from_dict(_SAMPLE_TARGETS[kind]))]}
            for id in effect_ids()
        ],
    })

def validate(level_json: str) -> str | None:
    try:
        level_from_dict(json.loads(level_json))
    except (ValueError, KeyError, TypeError) as error:
        return str(error)
    return None

def start(level_json: str) -> str:
    global _level
    _level = json.loads(level_json)
    _moves.clear()
    _redo.clear()
    _replay()
    return snapshot()

def _replay() -> None:
    global _controller
    _controller = GameController(GameState(level_from_dict(_level)))
    _pending.clear()
    for move in _moves:
        for intent in move:
            _controller.handle(intent)

def _handle(intent: Intent) -> str:
    if _controller is None:
        raise ValueError("no game started")
    plays = _controller.game_state.plays_remaining
    _controller.handle(intent)
    _pending.append(intent)
    if _controller.game_state.plays_remaining != plays:
        _moves.append(list(_pending))
        _pending.clear()
        _redo.clear()
    return snapshot()

def undo() -> str:
    if _moves:
        _redo.append(_moves.pop())
    _replay()
    return snapshot()

def redo() -> str:
    if _redo:
        _moves.append(_redo.pop())
    _replay()
    return snapshot()

def start_solution(level_json: str, moves_json: str) -> str:
    start(level_json)
    _redo.extend(reversed([[_intent_from_dict(intent) for intent in move] for move in json.loads(moves_json)]))
    return snapshot()

def solve_start(level_json: str, max_states: int) -> None:
    global _search
    _search = search_level(level_from_dict(json.loads(level_json)), max_states)

def solve_step(seconds: float) -> str:
    if _search is None:
        raise ValueError("no solve started")
    deadline = time.monotonic() + seconds
    states = 0
    try:
        while time.monotonic() < deadline:
            states = next(_search)
    except StopIteration as stop:
        return json.dumps(_result_to_dict(stop.value))
    return json.dumps({"status": "running", "states": states})

def _result_to_dict(result: SolveResult) -> dict[str, Any]:
    match result:
        case Solved(steps=steps, solutions=solutions, counted_all=counted_all, states=states):
            return {
                "status": "solved",
                "plays": len(steps),
                "solutions": solutions,
                "counted_all": counted_all,
                "states": states,
                "steps": [_step_to_dict(step) for step in steps],
            }
        case Unsolvable(reason=reason, states=states):
            return {"status": "unsolvable", "reason": reason, "states": states}
        case GaveUp(searched=searched, states=states):
            return {"status": "gave_up", "searched": searched, "states": states}
        case _:
            raise ValueError(f"unhandled result {result}")

def _step_to_dict(step: Step) -> dict[str, Any]:
    move: Move = step.move
    return {
        "card": _one_line(move.card.label),
        "single_use": move.card.single_use,
        "coords": [[c.row, c.col] for c in move.coords],
        "target": None if move.target is None else _one_line(move.target.label),
        "intents": [_intent_to_dict(intent) for intent in step.intents],
    }

def _one_line(label: str) -> str:
    return " ".join(label.replace(",\n", ", ").split("\n"))

def _intent_to_dict(intent: Intent) -> dict[str, Any]:
    match intent:
        case ClickedCard(index=index):
            return {"card": index}
        case ClickedTile(coord=coord):
            return {"tile": [coord.row, coord.col]}
        case ClickedNothing():
            return {}
        case _:
            raise ValueError(f"unhandled intent {intent}")

def _intent_from_dict(data: dict[str, Any]) -> Intent:
    if "card" in data:
        return ClickedCard(data["card"])
    if "tile" in data:
        return ClickedTile(Coord(*data["tile"]))
    return ClickedNothing()

def tap_tile(row: int, col: int) -> str:
    return _handle(ClickedTile(Coord(row, col)))

def tap_card(index: int) -> str:
    return _handle(ClickedCard(index))

def tap_nothing() -> str:
    return _handle(ClickedNothing())

def snapshot() -> str:
    if _controller is None:
        raise ValueError("no game started")
    state = _controller.game_state
    board = state.board
    view = build_view_state(state, _controller.phase)
    cells = [
        {
            "type": tile.type.id,
            "flipped": tile.is_flipped,
            "link": tile.link,
            "substrate": substrate.type.id,
            "period": substrate.type.period,
            "counter": substrate.counter,
        }
        for (_, tile), (_, substrate) in zip(board.iterate_tiles(), board.iterate_substrates())
    ]
    return json.dumps({
        "width": board.width,
        "height": board.height,
        "cells": cells,
        "hand": [{"label": card.label, "single_use": card.single_use} for card in state.hand],
        "plays": view.plays_remaining,
        "picked": [[c.row, c.col] for c in view.picked],
        "candidate_tiles": [[c.row, c.col] for c in view.candidate_tiles],
        "candidate_cards": list(view.candidate_cards),
        "selected": view.selected,
        "targeting": view.is_targeting,
        "game_over": view.game_over,
        "won": view.won,
        "can_undo": bool(_moves),
        "can_redo": bool(_redo),
    })
