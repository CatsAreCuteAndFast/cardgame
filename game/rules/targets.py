from dataclasses import dataclass
from game.core.coord import Coord

@dataclass(frozen=True)
class Fixed:
    coords: tuple[Coord, ...]

@dataclass(frozen=True)
class ChooseFrom:
    coords: tuple[Coord, ...]

@dataclass(frozen=True)
class ChooseAny:
    count: int = 1
    
@dataclass(frozen=True)
class ChooseCard:
    ...
    
type TargetSpec = Fixed | ChooseFrom | ChooseAny | ChooseCard

def _format_coords(coords: tuple[Coord, ...]) -> str:
    return ",\n".join(f"({c.row},{c.col})" for c in coords)

def describe(spec: TargetSpec) -> str:
    match spec:
        case Fixed(coords=coords):
            return _format_coords(coords)
        case ChooseFrom(coords=coords):
            return f"one of\n{_format_coords(coords)}"
        case ChooseAny(count=count):
            return f"any {count}"
        case ChooseCard():
            return f"modify\ncard"
        case _:
            raise ValueError(f"target of type {spec} doesnt exist")
        
def required_coords(spec: TargetSpec) -> int:
    match spec:
        case Fixed():
            return 0
        case ChooseFrom():
            return 1
        case ChooseAny(count=count):
            return count
        case ChooseCard():
            return 1
        case _:
            raise ValueError(f"unhandled spec {spec}")
        
def is_candidate(spec: TargetSpec, coord: Coord) -> bool:
    match spec:
        case Fixed(coords=coords) | ChooseFrom(coords=coords):
            return coord in coords
        case ChooseAny():
            return True
        case _: raise ValueError(f"unhandled target {spec}")
    return False