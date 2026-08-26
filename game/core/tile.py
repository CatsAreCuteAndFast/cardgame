from dataclasses import dataclass
from game.core.tiletype import TileType

@dataclass
class Tile:
    type: TileType
    is_flipped: bool = False
    
    def flip(self) -> bool:
        if not self.type.can_flip:
            return False
        self.is_flipped = not self.is_flipped
        return True
    
    def set_flipped(self, value: bool) -> bool:
        if self.is_flipped == value or not self.type.can_flip:
            return False
        self.is_flipped = value
        return True
    
        