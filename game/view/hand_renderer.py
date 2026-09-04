import pygame
from typing import Sequence
from game.view.hand_layout import HandLayout
from game.rules.card import Card
from game.rules.view_state import ViewState

CANDIDATE_COLOR = (140, 160, 200)
TARGETING_COLOR = (100, 125, 190)
SELECTED_COLOR = (150, 65, 65)
PICKED_COLOR = (150, 40, 40)
CARD_COLOR = (200, 200, 200)

class HandRenderer:
    def __init__(self, font_ratio=0.25) -> None:
        self.font_ratio = font_ratio
        
    def draw(self, surface: pygame.Surface, hand_layout: HandLayout, card_list: Sequence[Card], view_state: ViewState) -> None:
        font = pygame.font.Font(None, int(hand_layout.card_height * self.font_ratio))
        for index, card in enumerate(card_list):
            card_rect = hand_layout.rect_for(index)
            pygame.draw.rect(surface, CARD_COLOR, card_rect, border_radius=hand_layout.border_size)
            outline = self.outline(index, view_state)
            if outline is not None:
                pygame.draw.rect(surface, outline, card_rect, width=hand_layout.border_size // 2, border_radius=hand_layout.border_size)
            text = font.render(card.label, True, "black")
            text_rect = text.get_rect(center=card_rect.center)
            surface.blit(text, text_rect)
            
    def outline(self, index: int, view_state: ViewState) -> None | tuple[int, int, int]:
        if view_state.selected == index and view_state.is_targeting:
            return PICKED_COLOR
        if view_state.selected == index:
            return SELECTED_COLOR
        elif index in view_state.candidate_cards and view_state.is_targeting:
            return TARGETING_COLOR
        elif index in view_state.candidate_cards:
            return CANDIDATE_COLOR
            
            