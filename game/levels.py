from game.core.board import Board
from game.core.coord import Coord
from game.core.tile import Tile
from game.core.tiletype import get_type

tile_list = [Tile(get_type("basic")), Tile(get_type("basic")), Tile(get_type("basic")), Tile(get_type("basic")), Tile(get_type("basic")), Tile(get_type("basic")), Tile(get_type("basic")), Tile(get_type("notflippable"))]

board_size = 3, 3
#board = Board(board_size, tile_list)
board_filled = Board.filled(board_size, "basic")

def demo_board() -> Board:
    return board_filled
