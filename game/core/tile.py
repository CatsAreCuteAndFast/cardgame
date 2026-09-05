from dataclasses import dataclass
from game.core.tiletype import TileType

@dataclass
class Tile:
    type: TileType
    is_flipped: bool = False
    link: str | None = None
    
    def flip(self) -> None:
        self.is_flipped = not self.is_flipped
    
    def set_flipped(self, value: bool) -> bool:
        if self.is_flipped == value:
            return False
        self.is_flipped = value
        return True
    
        