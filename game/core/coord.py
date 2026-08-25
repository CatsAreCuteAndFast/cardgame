from dataclasses import dataclass

@dataclass(frozen=True)
class Coord:
    row: int
    col: int
    
    def __add__(self, other: Coord) -> Coord:
        return Coord(self.row + other.row, self.col + other.col)