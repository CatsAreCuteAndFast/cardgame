from dataclasses import dataclass
from game.core.coord import Coord

@dataclass(frozen=True)
class Idle: ...

@dataclass(frozen=True)
class Selected:
    index: int
    
@dataclass(frozen=True)
class Targeting:
    index: int
    coords: tuple[Coord, ...] = ()
    target_index: int | None = None

@dataclass(frozen=True) 
class GameOver: ...
    
type Phase = Idle | Selected | Targeting | GameOver