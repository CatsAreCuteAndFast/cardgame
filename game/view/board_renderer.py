import pygame
from game.view.board_layout import BoardLayout
from game.core.board import Board
from game.core.tile import Tile

class BoardRenderer:
    def __init__(self, tile_color=(200, 200, 200), flipped_color=(150, 0, 0), font_ratio = 0.25) -> None:
        self.tile_color = tile_color
        self.flipped_color = flipped_color
        self.font_ratio = font_ratio
        
    def draw(self, surface: pygame.Surface, board_layout: BoardLayout, board: Board):
        font = pygame.font.Font(None, int(board_layout.tile_size * self.font_ratio))
        for coord, tile in board.iterate_tiles():
            rect = board_layout.rect_for(coord)
            pygame.draw.rect(surface, self.color_tile(tile), rect)
            text_surf = font.render(f"{tile.type.id},\n{coord.row}, {coord.col}", False, "black")
            text_rect = text_surf.get_rect(center=rect.center)
            surface.blit(text_surf, text_rect)
            
    def color_tile(self, tile: Tile) -> tuple[int, int, int]:
        if tile.is_flipped:
            return self.flipped_color
        else:
            return self.tile_color