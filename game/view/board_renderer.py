import pygame
from game.view.layout import Layout
from game.core.board import Board

class BoardRenderer:
    def __init__(self, tile_color=(200, 200, 200)) -> None:
        self.tile_color = tile_color
        
    def draw(self, surface: pygame.Surface, layout: Layout, board: Board):
        font = pygame.font.Font(None, layout.tile_size // 4)
        for coord, tile in board.iterate_tiles():
            rect = layout.rect_for(coord)
            pygame.draw.rect(surface, self.tile_color, rect)
            text_surf = font.render(f"{tile.type.id},\n{coord.row}, {coord.col}", False, "black")
            text_rect = text_surf.get_rect(center=rect.center)
            surface.blit(text_surf, text_rect)
        