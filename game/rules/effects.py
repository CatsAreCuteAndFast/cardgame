from game.core.board import Board
from game.core.coord import Coord

class Flip:
    def apply(self, board: Board, coords: tuple[Coord, ...]):
        target_tiles = [board.get(coord) for coord in coords]
        for tile in target_tiles:
            tile.flip()
            
type Effect = Flip

_REGISTRY: dict[str, Effect] = {"flip": Flip()}
            
def get_effect(id: str) -> Effect:
    return _REGISTRY[id]