from dataclasses import dataclass
from game.core.coord import Coord

@dataclass(frozen=True)
class Fixed:
    coords: tuple[Coord, ...]

@dataclass(frozen=True)
class ChooseFrom:
    coords: tuple[Coord, ...]
    count: int = 1

@dataclass(frozen=True)
class ChooseAny:
    count: int = 1
    
type TargetSpec = Fixed | ChooseFrom | ChooseAny

def _format_coords(coords: tuple[Coord, ...]) -> str:
    return ",\n".join(f"({c.row},{c.col})" for c in coords)

def describe(spec: TargetSpec) -> str:
    match spec:
        case Fixed(coords=coords):
            return _format_coords(coords)
        case ChooseFrom(coords=coords, count=count):
            return f"{count} of {_format_coords(coords)}"
        case ChooseAny(count=count):
            return f"any {count}"
        case _:
            raise ValueError(f"target of type {spec} doesnt exist")