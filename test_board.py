from game.core.board import Board
from game.core.coord import Coord
from game.core.tile import Tile
from game.core.tiletype import get_type

tile_list = [Tile(get_type("basic")), Tile(get_type("basic")), Tile(get_type("basic")), Tile(get_type("basic")), Tile(get_type("basic")), Tile(get_type("basic")), Tile(get_type("basic")), Tile(get_type("notflippable"))]

board_size = 2, 4
board = Board(board_size, tile_list)

for x in board.iterate_tiles():
    print(x)

