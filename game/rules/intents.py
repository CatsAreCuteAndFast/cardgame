from dataclasses import dataclass
from game.core.coord import Coord

@dataclass(frozen=True)
class ClickedCard:
    index: int

@dataclass(frozen=True)
class ClickedTile:
    coord: Coord

@dataclass(frozen=True)
class ClickedNothing:
    pass

type Intent = ClickedCard | ClickedTile | ClickedNothing
        
    
