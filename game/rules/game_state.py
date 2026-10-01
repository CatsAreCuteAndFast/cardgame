from game.rules.level import Level
from game.rules.card import Card

class GameState:
    def __init__(self, level: Level) -> None:
        self.level = level
        self.plays_remaining = level.play_budget
        self.board = level.make_board()
        self.hand = list(level.card_list)
        
    @property
    def is_won(self) -> bool:
        return all(tile.is_flipped for tile in self.board.tiles)

    @property 
    def can_play(self) -> bool:
        return self.plays_remaining > 0
        
    def add_card(self, card: Card) -> None:
        self.hand.append(card)
        
    def advance_turn(self) -> None:
        if self.plays_remaining <= 0:
            raise ValueError(f"{self.plays_remaining} already hit 0")
        else:
            self.plays_remaining -= 1
        self.board.tick()