import json
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
