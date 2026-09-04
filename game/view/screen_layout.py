import pygame
from typing import Sequence
from game.view.board_layout import BoardLayout
from game.view.hand_layout import HandLayout

HAND_FRACTION = 0.25
BORDER_RATIO = 0.12
DEBUG_PANEL_FRACTION = 0.05

class ScreenLayout:
    def __init__(self, area: pygame.Rect, board_size: tuple[int, int], card_count: int) -> None:
        self.debug_panel_rect, board_rect, hand_rect = self._split(area)
        self.board = BoardLayout(board_rect, board_size, border_ratio=BORDER_RATIO)
        self.hand = HandLayout(hand_rect, card_count, border_ratio=BORDER_RATIO)
        
    def _split(self, area: pygame.Rect) -> tuple[pygame.Rect, pygame.Rect, pygame.Rect]:
        debug_panel_height = int(area.height * DEBUG_PANEL_FRACTION)
        hand_height = int(area.height * HAND_FRACTION)
        board_height = area.height - hand_height - debug_panel_height
        
        debug_panel_rect = pygame.Rect(area.x, area.y, area.width, debug_panel_height)
        board_rect = pygame.Rect(area.x, debug_panel_rect.bottom, area.width, board_height)
        hand_rect = pygame.Rect(area.x, board_rect.bottom, area.width, hand_height)
    
        return debug_panel_rect, board_rect, hand_rect
        