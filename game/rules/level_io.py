import json
from pathlib import Path
from typing import Any
from game.core.coord import Coord
from game.rules.card import Card
from game.rules.level import Level
from game.rules.targets import TargetSpec, Fixed, ChooseFrom, ChooseAny, ChooseAdjacent, ChooseCard

TARGET_KINDS = ("fixed", "from", "any", "adjacent", "card")

def _coords_from(data: Any) -> tuple[Coord, ...]:
    return tuple(Coord(int(row), int(col)) for row, col in data)

def _coords_to(coords: tuple[Coord, ...]) -> list[list[int]]:
    return [[coord.row, coord.col] for coord in coords]

def target_from_dict(data: dict[str, Any]) -> TargetSpec:
    match data.get("kind"):
        case "fixed":
            return Fixed(_coords_from(data["coords"]))
        case "from":
            return ChooseFrom(_coords_from(data["coords"]))
        case "any":
            return ChooseAny(int(data["count"]))
        case "adjacent":
            return ChooseAdjacent(int(data["count"]))
        case "card":
            return ChooseCard()
        case kind:
            raise ValueError(f"unknown target kind {kind!r}")

def target_to_dict(spec: TargetSpec) -> dict[str, Any]:
    match spec:
        case Fixed(coords=coords):
            return {"kind": "fixed", "coords": _coords_to(coords)}
        case ChooseFrom(coords=coords):
            return {"kind": "from", "coords": _coords_to(coords)}
        case ChooseAny(count=count):
            return {"kind": "any", "count": count}
        case ChooseAdjacent(count=count):
            return {"kind": "adjacent", "count": count}
        case ChooseCard():
            return {"kind": "card"}
        case _:
            raise ValueError(f"unhandled target {spec}")

def _card_from_dict(data: dict[str, Any]) -> Card:
    return Card(str(data["effect"]), target_from_dict(data["target"]), bool(data.get("single_use", False)))

def _card_to_dict(card: Card) -> dict[str, Any]:
    data: dict[str, Any] = {"effect": card.effect_id, "target": target_to_dict(card.targets)}
    if card.single_use:
        data["single_use"] = True
    return data

def level_from_dict(data: dict[str, Any]) -> Level:
    try:
        return Level(
            int(data["budget"]),
            tuple(_card_from_dict(card) for card in data["cards"]),
            tuple(tuple(str(tile_id) for tile_id in row) for row in data["tiles"]),
            tuple(tuple(str(substrate_id) for substrate_id in row) for row in data["substrates"]),
            tuple(_coords_from(group) for group in data.get("links", [])),
        )
    except KeyError as error:
        raise ValueError(f"missing field {error}") from None
    except (TypeError, AttributeError) as error:
        raise ValueError(f"malformed level data: {error}") from None

def level_to_dict(level: Level) -> dict[str, Any]:
    return {
        "budget": level.play_budget,
        "tiles": [list(row) for row in level.tile_list],
        "substrates": [list(row) for row in level.substrate_list],
        "links": [_coords_to(group) for group in level.link_groups],
        "cards": [_card_to_dict(card) for card in level.card_list],
    }

def load_level(path: str | Path) -> Level:
    return level_from_dict(json.loads(Path(path).read_text()))
