from dataclasses import dataclass

@dataclass(frozen=True)
class Coord:
    row: int
    col: int
    
    def __add__(self, other: Coord) -> Coord:
        return Coord(self.row + other.row, self.col + other.col)
    
ADJACENT_OFFSETS = (Coord(-1, 0), Coord(1, 0), Coord(0, -1), Coord(0, 1))
    
def is_adjacent(a: Coord, b: Coord) -> bool:
    return any(a + offset == b for offset in ADJACENT_OFFSETS)