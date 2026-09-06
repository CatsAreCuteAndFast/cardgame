import pygame
from game.view.board_layout import BoardLayout
from game.core.board import Board
from game.core.tile import Tile
from game.core.coord import Coord
from game.rules.view_state import ViewState

TILE_COLOR = (200, 200, 200)
FLIPPED_COLOR = (150, 40, 40)
CANDIDATE_COLOR = (140, 160, 200)
TARGETING_COLOR = (100, 125, 190)
PICKED_COLOR = (150, 65, 65)

class BoardRenderer:
    def __init__(self, font_ratio=0.25) -> None:
        self.font_ratio = font_ratio
        
    def draw(self, surface: pygame.Surface, board_layout: BoardLayout, board: Board, view_state: ViewState) -> None:
        font = pygame.font.Font(None, int(board_layout.tile_size * self.font_ratio))
        for coord, tile in board.iterate_tiles():
            rect = board_layout.rect_for(coord)
            pygame.draw.rect(surface, self.color_tile(tile), rect, border_radius=board_layout.border_size)
            outline = self.outline_color(coord, view_state)
            if outline is not None:
                pygame.draw.rect(surface, outline, rect, width=max(1, board_layout.border_size // 2), border_radius=board_layout.border_size)
            text_surf = font.render(self._explain_tile(tile, coord), True, "black")
            text_rect = text_surf.get_rect(center=rect.center)
            surface.blit(text_surf, text_rect)
            
    def _explain_tile(self, tile: Tile, coord: Coord) -> str:
        parts: list[str] = [tile.type.id, f"{coord.row}, {coord.col}"]
        if tile.link is not None:
            parts.append(f"link: {tile.link}")
        return "\n".join(parts)
        
            
    def color_tile(self, tile: Tile) -> tuple[int, int, int]:
        if tile.is_flipped:
            return FLIPPED_COLOR        
        else:
            return TILE_COLOR
        
    def outline_color(self, coord: Coord, view_state: ViewState) -> None | tuple[int, int, int]:
        if coord in view_state.picked:
            return PICKED_COLOR
        elif coord in view_state.candidate_tiles and view_state.is_targeting:
            return TARGETING_COLOR
        elif coord in view_state.candidate_tiles:
            return CANDIDATE_COLOR