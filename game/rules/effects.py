from game.core.board import Board
from game.core.coord import Coord

class FlipEffect:
    def apply(self, board: Board, coord: Coord):
        target_tile = board.get(coord)
        target_tile.flip()