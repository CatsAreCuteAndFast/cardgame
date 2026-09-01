from dataclasses import replace
from game.rules.game_state import GameState
from game.core.coord import Coord
from game.rules.intents import Intent, ClickedTile, ClickedCard, ClickedNothing
from game.rules.targets import TargetSpec, Fixed, ChooseAny, ChooseFrom, required_coords, ChooseCard, is_candidate
from game.rules.effects import get_effect, can_modify, Flip, Retarget, Swap
from game.rules.card import Card
from game.rules.phases import Idle, Selected, Targeting, Phase, GameOver

class GameController:
    def __init__(self, game_state: GameState) -> None:
        self.game_state = game_state
        self.phase: Phase = Idle()
        
    @property
    def selected_card(self) -> Card | None:
        match self.phase:
            case Idle() | GameOver():
                return None
            case Selected(index=index) | Targeting(index=index):
                return self.game_state.hand[index]
            case _:
                raise ValueError(f"unhandled phase {self.phase}")
        
    def _require_valid_index(self, index: int) -> None:
        if not 0 <= index < len(self.game_state.hand):
            raise IndexError(f"{index} is out of bounds for a hand of {len(self.game_state.hand)}")
        
    def _remove_card(self, index: int) -> None:
        self._require_valid_index(index)
        self.game_state.hand.pop(index)
        
    def _handle_idle(self, intent: Intent) -> None:
        if not self.game_state.can_play:
            self.phase = GameOver()
            return
        match intent:
            case ClickedTile() | ClickedNothing():
                return
            case ClickedCard(index=index):
                self.phase = Selected(index)
            case _: raise ValueError(f"unhandled intent {intent}")
        
    def _handle_selected(self, intent: Intent, phase: Selected) -> None:
        match intent:
            case ClickedNothing() | ClickedTile():
                self.phase = Idle()
            case ClickedCard(index=clicked_index):
                if phase.index == clicked_index:
                    self.phase = Targeting(phase.index)
                    self._try_execute(self.phase)
                else:
                    self.phase = Selected(clicked_index)
            case _: raise ValueError(f"unhandled intent {intent}")
        
    def _handle_targeting(self, intent: Intent, phase: Targeting) -> None:
        card = self.game_state.hand[phase.index]
        match card.targets:
            case ChooseCard():
                self._handle_targeting_card(intent, phase)
            case ChooseFrom() | ChooseAny() | Fixed():
                self._handle_targeting_tile(intent, phase)
            case _:
                raise ValueError(f"unhandled target {card.targets}")
        
    def _handle_targeting_card(self, intent: Intent, phase: Targeting) -> None:
        match intent:
            case ClickedNothing() | ClickedTile():
                self.phase = Idle()
            case ClickedCard(index=index):
                card = self.game_state.hand[index]
                current_card = self.game_state.hand[phase.index]
                effect = get_effect(current_card.effect_id)
                spec = card.targets
                if can_modify(effect, spec):
                    self.phase = replace(phase, card=index)
                    self._try_execute(self.phase)
            case _: raise ValueError(f"unhandled intent {intent}")
        
    def _handle_targeting_tile(self, intent: Intent, phase: Targeting) -> None:
        match intent:
            case ClickedNothing() | ClickedCard():
                self.phase = Idle()
            case ClickedTile(coord=coord):
                card = self.game_state.hand[phase.index]
                if is_candidate(card.targets, coord) and coord not in phase.coords:
                    new_phase = replace(phase, coords=phase.coords + (coord,))
                    self.phase = new_phase
                    self._try_execute(new_phase)
            case _: raise ValueError(f"unhandled intent {intent}")
                
    def _try_execute(self, phase: Targeting) -> None:
        card = self.game_state.hand[phase.index]
        match card.targets:
            case ChooseCard():
                if phase.card is not None:
                    self._execute(card, phase)
            case ChooseAny() | ChooseFrom() | Fixed():
                if len(phase.coords) == required_coords(card.targets):
                    self._execute(card, phase)
            case _: raise ValueError(f"unhandled target {card.targets}")
            
    def _resolve_coords(self, spec: TargetSpec, phase: Targeting) -> tuple[Coord, ...]:
        match spec:
            case Fixed(coords=coords):
                return coords
            case ChooseFrom() | ChooseAny():
                return phase.coords
            case _: raise ValueError(f"unhandled target {spec}")
        
    def _execute(self, card: Card, phase: Targeting) -> None:
        effect = get_effect(card.effect_id)
        match effect:
            case Flip() | Swap():
                coords = self._resolve_coords(card.targets, phase)
                effect.apply(self.game_state.board, coords)
            case Retarget():
                if phase.card is None:
                    raise ValueError(f"{repr(phase.card)} is none during execute")
                target_card = self.game_state.hand[phase.card]
                new_card = effect.apply(target_card)
                self.game_state.add_card(new_card)
            case _: raise ValueError(f"unhandled effect {effect}")
        self.game_state.spend_play()
        if card.single_use:
            self._remove_card(phase.index)
        if self.game_state.can_play:
            self.phase = Idle()
        else:
            self.phase = GameOver()
        
        
    def handle(self, intent: Intent) -> None:
        match self.phase:
            case GameOver():
                return
            case Idle():
                self._handle_idle(intent)
            case Selected() as phase:
                self._handle_selected(intent, phase)
            case Targeting() as phase:
                self._handle_targeting(intent, phase)
            case _:
                raise ValueError(f"unhandled phase {self.phase}")