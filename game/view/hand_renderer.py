import pygame
from typing import Sequence
from game.view.hand_layout import HandLayout
from game.rules.cardtype import CardType

class HandRenderer:
    def __init__(self, color: tuple[int, int, int]=(200, 200, 200), font_ratio=0.25) -> None:
        self.color = color
        self.font_ratio = font_ratio
        
    def draw(self, surface: pygame.Surface, hand_layout: HandLayout, card_list: Sequence[CardType]) -> None:
        font = pygame.font.Font(None, int(hand_layout.card_height * self.font_ratio))
        for index, card in enumerate(card_list):
            card_rect = hand_layout.rect_for(index)
            pygame.draw.rect(surface, self.color, card_rect)
            text = font.render(f"{card.id}", False, "black")
            text_rect = text.get_rect(center = card_rect.center)
            surface.blit(text, text_rect)
            
            