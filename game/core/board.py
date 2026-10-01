from game.core.tile import Tile
from game.core.coord import Coord
from game.core.tiletype import get_tile_type
from game.core.substrate import Substrate
from game.core.substratetype import get_substrate_type

class Board:
    def __init__(self, size: tuple[int, int], tiles: list[Tile], substrates: list[Substrate]) -> None:
        self.width, self.height = size
        self._check_length(tiles, substrates)
        self.tiles = list(tiles)
        self.substrates = list(substrates)
        
    @classmethod
    def filled(cls, size: tuple[int, int], id: str) -> Board:
        width, height = size
        tiles: list[Tile] = []
        substrates: list[Substrate] = []
        for _ in range(width * height):
            tiles.append(Tile(get_tile_type(id)))
            substrates.append(Substrate(get_substrate_type("plain")))
        return cls(size, tiles, substrates)
    
    @property
    def size(self) -> tuple[int, int]:
        return (self.width, self.height)
        
    def _check_length(self, tiles: list[Tile], substrates: list[Substrate]) -> None:
        if len(tiles) != self.width * self.height:
            raise ValueError(f"Expected {self.width * self.height} tiles. Got {len(tiles)}")
        if len(substrates) != self.width * self.height:
            raise ValueError(f"Expected {self.width * self.height} substrates. Got {len(substrates)}")
    def _index(self, coord: Coord):
        return self.width * coord.row + coord.col
    
    def _coord(self, index: int):
        return Coord(*divmod(index, self.width))
    
    def in_bounds(self, coord: Coord):
        return 0 <= coord.row < self.height and 0 <= coord.col < self.width
    
    def get_tile(self, coord: Coord) -> Tile:
        if not self.in_bounds(coord):
            raise ValueError(f"{coord} is outside of bounds ({self.width}x{self.height})")
        return self.tiles[self._index(coord)]
    
    def get_substrate(self, coord: Coord) -> Substrate:
        if not self.in_bounds(coord):
            raise ValueError(f"{coord} is outside of bounds ({self.width}x{self.height})")
        return self.substrates[self._index(coord)]
        
    def iterate_tiles(self):
        for index, tile in enumerate(self.tiles):
            yield self._coord(index), tile
            
    def iterate_substrates(self):
        for index, substrate in enumerate(self.substrates):
            yield self._coord(index), substrate
            
    def swap_tiles(self, a: Coord, b: Coord) -> None:
        # doesnt swap substrates
        if not (self.in_bounds(a) and self.in_bounds(b)):
            raise ValueError(f"{a} or {b} is outside of bounds ({self.width}x{self.height})")
        i, j = self._index(a), self._index(b)
        self.tiles[i], self.tiles[j] = self.tiles[j], self.tiles[i]
        
    def tick(self) -> None:
        for substrate in self.substrates:
            substrate.tick()
        
    def __repr__(self) -> str:
        return f"Board({self.width}x{self.height}, {len(self.tiles)} tiles)"