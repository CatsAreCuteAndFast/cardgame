import pygame
from game.view.board_renderer import BoardRenderer
from game.view.hand_renderer import HandRenderer
from game.view.screen_layout import ScreenLayout
from game.rules.view_state import ViewState
from game.rules.card import Card
from game.core.board import Board
from typing import Sequence

FONT_RATIO = 0.2

class GameRenderer:
    def __init__(self) -> None:
        self.board_renderer = BoardRenderer(font_ratio=FONT_RATIO)
        self.hand_renderer = HandRenderer(font_ratio=FONT_RATIO)
        
    def draw(self, surface: pygame.Surface, layouts: ScreenLayout, board: Board, view_state: ViewState, card_list: Sequence[Card]) -> None:
        self.board_renderer.draw(surface, layouts.board, board, view_state)
        self.hand_renderer.draw(surface, layouts.hand, card_list, view_state)
        self.draw_debug_panel(surface, layouts.debug_panel_rect, view_state)
        
    def draw_debug_panel(self, surface: pygame.Surface, debug_panel_rect: pygame.Rect, view_state: ViewState) -> None:
        debug_strings = ["plays remaining: " + str(view_state.plays_remaining), "game over: " + str(view_state.game_over)]
        font = pygame.font.Font(None, debug_panel_rect.height)
        text = ", ".join(debug_strings)
        text_surf = font.render(text, True, "white")
        text_rect = text_surf.get_rect(center=debug_panel_rect.center)
        surface.blit(text_surf, text_rect)
        