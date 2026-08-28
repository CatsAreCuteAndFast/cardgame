import pygame
from game.view.board_layout import BoardLayout
from game.view.hand_layout import HandLayout

HAND_FRACTION = 0.25

class ScreenLayout:
    def __init__(self, area: pygame.Rect, board_size: tuple[int, int], card_count: int) -> None:
        board_rect, hand_rect = self._split(area)
        self.board = BoardLayout(board_rect, board_size)
        self.hand = HandLayout(hand_rect, card_count)
        
    def _split(self, area: pygame.Rect) -> tuple[pygame.Rect, pygame.Rect]:
        hand_height = int(area.height * HAND_FRACTION)
        board_height = area.height - hand_height
        
        board_rect = pygame.Rect(area.x, area.y, area.width, board_height)
        hand_rect = pygame.Rect(area.x, board_rect.bottom, area.width, hand_height)
    
        return board_rect, hand_rect