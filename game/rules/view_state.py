from dataclasses import dataclass
from game.core.coord import Coord
from game.rules.phases import Phase, Idle, Selected, GameOver, Targeting, Won
from game.rules.game_state import GameState
from game.rules.targets import Fixed, ChooseFrom, ChooseAdjacent, ChooseAny, ChooseCard, is_candidate, required_coords
from game.rules.effects import get_effect, can_target, can_modify, affected, blocked

@dataclass(frozen=True)
class ViewState:
    plays_remaining: int
    picked: tuple[Coord, ...] = ()
    candidate_tiles: tuple[Coord, ...] = ()
    candidate_cards: tuple[int, ...] = ()
    game_over: bool = False
    won: bool = False
    selected: int | None = None
    is_targeting: bool = False
    preview: tuple[Coord, ...] = ()
    blocked: tuple[Coord, ...] = ()
    needed: int = 0
    
def _candidates(state: GameState, phase_index: int, picked: tuple[Coord, ...]) -> tuple[tuple[Coord, ...], tuple[int, ...]]:
    selected_card = state.hand[phase_index]
    selected_effect = get_effect(selected_card.effect_id)
    candidate_tiles: list[Coord] = []
    candidate_cards: list[int] = []
    match selected_card.targets:
        case ChooseCard():
            for index, card in enumerate(state.hand):
                if can_modify(selected_effect, card.targets):
                    candidate_cards.append(index)
        case ChooseAny() | ChooseAdjacent() | Fixed() | ChooseFrom():
            for coord, _ in state.board.iterate_tiles():
                if is_candidate(selected_card.targets, picked, coord) and can_target(selected_effect, state.board, coord):
                    candidate_tiles.append(coord)
        case _:
            raise ValueError(f"unhandled targeting {selected_card.targets}")
    return (tuple(candidate_tiles), tuple(candidate_cards))
    
def _preview(state: GameState, index: int, picked: tuple[Coord, ...]) -> tuple[tuple[Coord, ...], tuple[Coord, ...]]:
    card = state.hand[index]
    effect = get_effect(card.effect_id)
    match card.targets:
        case Fixed(coords=coords):
            return (affected(effect, state.board, coords), blocked(effect, state.board, coords))
        case ChooseFrom() | ChooseAny() | ChooseAdjacent():
            return (affected(effect, state.board, picked), blocked(effect, state.board, picked))
        case ChooseCard():
            return ((), ())
        case _:
            raise ValueError(f"unhandled targeting {card.targets}")

def hover_preview(state: GameState, phase: Phase, index: int, coord: Coord) -> tuple[tuple[Coord, ...], tuple[Coord, ...]]:
    card = state.hand[index]
    picked = phase.coords if isinstance(phase, Targeting) and phase.index == index else ()
    match card.targets:
        case Fixed() | ChooseCard():
            return _preview(state, index, picked)
        case ChooseFrom() | ChooseAny() | ChooseAdjacent():
            if is_candidate(card.targets, picked, coord) and can_target(get_effect(card.effect_id), state.board, coord):
                return _preview(state, index, picked + (coord,))
            return ((), ())
        case _:
            raise ValueError(f"unhandled targeting {card.targets}")

def build_view_state(state: GameState, phase: Phase) -> ViewState:
    match phase:
        case Idle():
            return ViewState(state.plays_remaining)
        case GameOver():
            return ViewState(state.plays_remaining, game_over=True)
        case Won():
            return ViewState(state.plays_remaining, won=True)
        case Selected(index=index):
            candidate_tiles, candidate_cards = _candidates(state, index, ())
            preview, blocked_coords = _preview(state, index, ())
            return ViewState(state.plays_remaining, selected=index, candidate_tiles=candidate_tiles, candidate_cards=candidate_cards, preview=preview, blocked=blocked_coords, needed=required_coords(state.hand[index].targets))
        case Targeting(index=index, coords=coords):
            candidate_tiles, candidate_cards = _candidates(state, index, coords)
            preview, blocked_coords = _preview(state, index, coords)
            return ViewState(state.plays_remaining, picked=coords, candidate_tiles=candidate_tiles, candidate_cards=candidate_cards, selected=index, is_targeting=True, preview=preview, blocked=blocked_coords, needed=required_coords(state.hand[index].targets))
        case _:
            raise ValueError(f"unhandled phase {phase}")