from game.core.tile import Tile
from game.core.coord import Coord
from game.core.tiletype import get_type

class Board:
    def __init__(self, size: tuple[int, int], tiles: list[Tile]) -> None:
        self.width, self.height = size
        self._check_length(tiles)
        self.tiles = list(tiles)
        
    @classmethod
    def filled(cls, size: tuple[int, int], id: str) -> Board:
        width, height = size
        tiles: list[Tile] = []
        for _ in range(width * height):
            tiles.append(Tile(get_type(id)))
        return cls(size, tiles)
        
    def _check_length(self, tiles: list[Tile]) -> None:
        if len(tiles) != self.width * self.height:
            raise ValueError(f"Expected {self.width * self.height} tiles. Got {len(tiles)}")
        
    def _index(self, coord: Coord):
        return self.width * coord.row + coord.col
    
    def _coord(self, index: int):
        return Coord(*divmod(index, self.width))
    
    def in_bounds(self, coord: Coord):
        return 0 <= coord.row < self.height and 0 <= coord.col < self.width
    
    def get(self, coord: Coord) -> Tile:
        if not self.in_bounds(coord):
            raise ValueError(f"{coord} is outside of bounds ({self.width}x{self.height})")
        return self.tiles[self._index(coord)]
    
    def iterate_tiles(self):
        for index, tile in enumerate(self.tiles):
            yield self._coord(index), tile
        
    def __repr__(self) -> str:
        return f"Board({self.width}x{self.height}, {len(self.tiles)} tiles)"