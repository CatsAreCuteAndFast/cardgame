from dataclasses import dataclass
from game.core.tiletype import TileType

@dataclass
class Tile:
    type: TileType
    is_flipped: bool = False
    link: str | None = None
    
    def copy(self) -> Tile:
        return Tile(self.type, self.is_flipped, self.link)

    def flip(self) -> None:
        self.is_flipped = not self.is_flipped
    
        