import pygame
from game.view.board_renderer import BoardRenderer
from game.view.hand_renderer import HandRenderer
from game.view.screen_layout import ScreenLayout
from game.rules.card import Card
from game.core.board import Board
from typing import Sequence

FONT_RATIO = 0.2

class GameRenderer:
    def __init__(self) -> None:
        self.board_renderer = BoardRenderer(font_ratio=FONT_RATIO)
        self.hand_renderer = HandRenderer(font_ratio=FONT_RATIO)
        
    def draw(self, surface: pygame.Surface, layouts: ScreenLayout, board: Board, card_list: Sequence[Card]) -> None:
        self.board_renderer.draw(surface, layouts.board, board)
        self.hand_renderer.draw(surface, layouts.hand, card_list)