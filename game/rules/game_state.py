from game.rules.level import Level
from game.rules.card import Card

class GameState:
    def __init__(self, level: Level) -> None:
        self.level = level
        self.plays_remaining = level.play_budget
        self.board = level.make_board()
        self.hand = list(level.card_list)
        self.selected_index: int | None = None
        
    @property 
    def can_play(self) -> bool:
        return self.plays_remaining > 0
    
    @property
    def selected_card(self) -> Card | None:
        if self.selected_index is None: 
            return None
        else:
            return self.hand[self.selected_index]
        
    def _require_valid_index(self, index: int) -> None:
        if not 0 <= index < len(self.hand):
            raise IndexError(f"{index} is out of bounds for a hand of {len(self.hand)}")
        
    def select(self, index: int) -> None:
        self._require_valid_index(index)
        self.selected_index = index
    
    def clear_selection(self) -> None:
        self.selected_index = None
    
    def remove_card(self, index: int) -> None:
        self._require_valid_index(index)
        self.hand.pop(index)
        self.clear_selection()
        
    def add_card(self, card: Card) -> None:
        self.hand.append(card)
        
    def spend_play(self) -> None:
        if self.plays_remaining <= 0:
            raise ValueError(f"{self.plays_remaining} already hit 0")
        else:
            self.plays_remaining -= 1