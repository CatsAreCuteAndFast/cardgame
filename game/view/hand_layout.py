import pygame

class HandLayout:
    def __init__(self, area: pygame.Rect, card_count: int, max_coverage: tuple[float, float]=(0.9, 0.9), gap_ratio=0.1, aspect=0.7, border_ratio=0.1) -> None:
        self.area = area
        self.card_count = card_count
        self.coverage_x, self.coverage_y = max_coverage
        self.gap_ratio = gap_ratio
        self.aspect = aspect
        self.border_ratio = border_ratio
        
        self._make_layout()
        
    def _make_layout(self) -> None:
        if self.card_count <= 0:
            self.card_width = self.card_height = 0
            self.gap_width = self.step = 0
            self.origin_x, self.origin_y = self.area.x, self.area.y
            return

        card_height = self.area.height * self.coverage_y
        card_width = card_height * self.aspect
        gap_width = card_width * self.gap_ratio

        total_width = card_width * self.card_count + gap_width * (self.card_count - 1)
        allowed_width = self.area.width * self.coverage_x

        if total_width > allowed_width:
            scale = allowed_width / total_width
            card_height *= scale
            card_width *= scale
            gap_width *= scale

        self.card_height = max(1, int(card_height))
        self.card_width = max(1, int(card_width))
        self.gap_width = max(0, int(gap_width))
        self.step = self.card_width + self.gap_width

        total_width = (
            self.card_width * self.card_count
            + self.gap_width * (self.card_count - 1)
        )
        self.origin_x = self.area.x + (self.area.width - total_width) // 2
        self.origin_y = self.area.y + (self.area.height - self.card_height) // 2
        
        self.border_size = int(self.card_width * self.border_ratio)
        
    def rect_for(self, index: int) -> pygame.Rect:
        if not 0 <= index < self.card_count:
            raise IndexError(f"{index} is out of bounds of {self.card_count}")
        x = self.origin_x + self.step * index
        return pygame.Rect(x, self.origin_y, self.card_width, self.card_height)
        
    def index_at(self, pos: tuple[int, int]) -> int | None:
        pos_x, pos_y = pos
        if not self.origin_y <= pos_y < self.origin_y + self.card_height:
            return None
        index, offset = divmod(pos_x - self.origin_x, self.step)
        if not 0 <= index < self.card_count:
            return None
        if offset >= self.card_width:
            return None
        return index
        