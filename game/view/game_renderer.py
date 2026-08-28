import pygame
from game.view.board_renderer import BoardRenderer
from game.view.hand_renderer import HandRenderer
from game.view.screen_layout import ScreenLayout
from game.rules.cardtype import CardType
from game.core.board import Board
from typing import Sequence

class GameRenderer:
    def __init__(self) -> None:
        self.board_renderer = BoardRenderer()
        self.hand_renderer = HandRenderer()
        
    def draw(self, surface: pygame.Surface, layouts: ScreenLayout, board: Board, card_list: Sequence[CardType]) -> None:
        self.board_renderer.draw(surface, layouts.board, board)
        self.hand_renderer.draw(surface, layouts.hand, card_list)