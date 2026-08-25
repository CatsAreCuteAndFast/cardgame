from game.core.tile import Tile

class Board:
    def __init__(self, size: tuple[int, int], tiles: list[Tile]) -> None:
        self.width, self.height = size
        self._check_length(tiles)
        self.tiles = list(tiles)
        
    def _check_length(self, tiles: list[Tile]) -> None:
        if len(tiles) != self.width * self.height:
            raise ValueError(f"Expected {self.width * self.height} tiles. Got {len(tiles)}")
        
    def __repr__(self) -> str:
        return f"Board({self.width}x{self.height}, {self.width*self.height} tiles)"