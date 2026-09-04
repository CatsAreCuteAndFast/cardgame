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
        
    def draw(self, surface: pygame.Surface, layouts: ScreenLayout, board: Board, card_list: Sequence[Card], debug_strings: Sequence[str]) -> None:
        self.board_renderer.draw(surface, layouts.board, board)
        self.hand_renderer.draw(surface, layouts.hand, card_list)
        self.draw_debug_panel(surface, layouts.debug_panel_rect, debug_strings)
        
    def draw_debug_panel(self, surface: pygame.Surface, debug_panel_rect: pygame.Rect, debug_strings: Sequence[str]) -> None:
        font = pygame.font.Font(None, debug_panel_rect.height)
        text = ", ".join(debug_strings)
        text_surf = font.render(text, True, "white")
        text_rect = text_surf.get_rect(center=debug_panel_rect.center)
        surface.blit(text_surf, text_rect)
        