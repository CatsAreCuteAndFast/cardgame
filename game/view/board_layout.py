import pygame
from game.core.coord import Coord

class BoardLayout:
    def __init__(self, area: pygame.Rect, size: tuple[int, int], max_coverage: tuple[float, float] = (0.9, 0.9), gap_ratio: float = 0.1, border_ratio=0.1) -> None:
        self.area = area
        self.width, self.height = size
        self.coverage_x, self.coverage_y = max_coverage
        self.gap_ratio = gap_ratio
        self.border_ratio = border_ratio

        self._make_layout()
        
    def _make_layout(self) -> None:
        # How much of the area we're allowed to fill.
        allowed_w = self.area.width * self.coverage_x
        allowed_h = self.area.height * self.coverage_y

        step_w = allowed_w / self.width
        step_h = allowed_h / self.height

        # One size serves both axes — the smaller candidate fits in both directions.
        self.step = max(1, int(min(step_w, step_h)))
        self.gap_size = int(self.step * self.gap_ratio)
        self.tile_size = max(1, self.step - self.gap_size)

        # Centre the finished grid inside the area.
        grid_w = self.step * self.width - self.gap_size
        grid_h = self.step * self.height - self.gap_size
        self.origin_x = self.area.x + (self.area.width - grid_w) // 2
        self.origin_y = self.area.y + (self.area.height - grid_h) // 2
        
        self.border_size = int(self.tile_size * self.border_ratio)
        
    def in_bounds(self, coord: Coord) -> bool:
        return 0 <= coord.col < self.width and 0 <= coord.row < self.height
        
    def rect_for(self, coord: Coord) -> pygame.Rect:
        if not self.in_bounds(coord):
            raise IndexError(f"coord given out of bounds {coord}")
        rect_origin_x = self.origin_x + coord.col * self.step
        rect_origin_y = self.origin_y + coord.row * self.step
        
        return pygame.Rect(rect_origin_x, rect_origin_y, self.tile_size, self.tile_size)
    
    def coord_at(self, pos: tuple[int, int]) -> Coord | None:
        pos_x, pos_y = pos
        coord_col = (pos_x - self.origin_x) // self.step
        coord_row = (pos_y - self.origin_y) // self.step
        coord = Coord(coord_row, coord_col)
        if self.in_bounds(coord):
            return coord
        else:
            return None
    



