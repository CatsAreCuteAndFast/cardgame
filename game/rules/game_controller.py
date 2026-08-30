from game.rules.game_state import GameState
from game.core.coord import Coord
from game.rules.intents import Intent, ClickedTile, ClickedCard, ClickedNothing
from game.rules.targets import TargetSpec, Fixed, ChooseAny, ChooseFrom 
from game.rules.effects import get_effect
from game.rules.card import Card

class GameController:
    def __init__(self, game_state: GameState) -> None:
        self.game_state = game_state
        self.pending_targets: list[Coord] = []
        
    def _handle_tile(self, clicked_tile: ClickedTile) -> None:
        def append_card():
            if clicked_tile.coord in self.pending_targets:
                return
            self.pending_targets.append(clicked_tile.coord)
            self._try_execute()
        if self.game_state.selected_card is None:
            return
        targets = self.game_state.selected_card.targets
        match targets:
            case ChooseAny():
                append_card()
            case ChooseFrom(coords=coords):
                if clicked_tile.coord in coords:
                    append_card()
            case Fixed():
                return
            case _:
                raise ValueError(f"unresolved case '{targets}'")
        
    def _handle_card(self, clicked_card: ClickedCard) -> None:
        def select_card() -> None:
            self.game_state.select(clicked_card.index)
            self._try_execute()
        if self.game_state.selected_index is None:
            select_card()
        elif self.game_state.selected_index != clicked_card.index:
            self._clear_selection()
            select_card()
        else:
            self._clear_selection()
        
    def _clear_selection(self) -> None:
        self.game_state.clear_selection()
        self.pending_targets.clear()
        
    def _check_complete(self, target_spec: TargetSpec) -> bool:
        match target_spec:
            case Fixed():
                return True
            case ChooseAny(count=count) | ChooseFrom(count=count):
                return count == len(self.pending_targets)
            case _:
                raise ValueError(f"unresolved case '{target_spec}'")
            
    def _try_execute(self) -> None:
        if self.game_state.selected_index is not None:
            index = self.game_state.selected_index
            card = self.game_state.hand[index]
            if self._check_complete(card.targets):
                self._execute(index, card)
                
    def _execute(self, index: int, card: Card) -> None:
        if self.game_state.plays_remaining == 0:
            self._clear_selection()
            return
        def apply_effect(coords: tuple[Coord, ...]) -> None:
            get_effect(card.effect_id).apply(self.game_state.board, coords)
        match card.targets:
            case Fixed(coords=coords):
                apply_effect(coords)
            case ChooseFrom() | ChooseAny():
                apply_effect(tuple(self.pending_targets))
            case _:
                raise ValueError(f"unresolved case '{card.targets}'")
        self.game_state.spend_play()
        if card.single_use:
            self.game_state.remove_card(index)
        self._clear_selection()
        
        
    def handle(self, intent: Intent) -> None:
        match intent:
            case ClickedTile():
                self._handle_tile(intent)
            case ClickedCard():
                self._handle_card(intent)
            case ClickedNothing():
                self._clear_selection()
            case _:
                raise ValueError(f"unhandled intent {intent}")