from dataclasses import replace
from game.core.tile import Tile
from game.core.board import Board
from game.core.coord import Coord
from game.rules.card import Card
from game.rules.targets import ChooseFrom, Fixed, TargetSpec, ChooseCard, ChooseAdjacent

class Flip:
    def _expand(self, board: Board, coords: tuple[Coord, ...]) -> set[Coord]:
        affected: set[Coord] = set()
        for coord in coords:
            tile = board.get(coord)
            if not tile.type.can_flip:
                continue
            link = tile.link
            if link is None:
                affected.add(coord)
            else:
                for other_coord, other_tile in board.iterate_tiles():
                    if other_tile.link == link:
                        affected.add(other_coord)
        return affected
    def apply(self, board: Board, coords: tuple[Coord, ...]) -> None:
        for coord in self._expand(board, coords):
            board.get(coord).flip()
            
class Retarget:
    def _convert(self, spec: TargetSpec) -> TargetSpec | None:
        match spec:
            case ChooseFrom(coords=coords):
                return Fixed(coords)
            case Fixed(coords=coords):
                return ChooseFrom(coords)
            case _:
                return None
            
    def can_modify(self, spec: TargetSpec) -> bool:
        return self._convert(spec) is not None
    
    def apply(self, card: Card) -> Card:
        spec = self._convert(card.targets)
        if spec is None:
            raise ValueError(f"cannot retarget {card.targets}")
        return replace(card, targets=spec, single_use=True)
    
class Swap:
    def apply(self, board: Board, coords: tuple[Coord, ...]) -> None:
        if not all(board.get(c).type.can_swap for c in coords): return
        if len(coords) != 2:
            raise ValueError(f"Swap expects 2 coords instead got {len(coords)}")
        board.swap_tiles(*coords)
        
        
type Effect = Flip | Retarget | Swap

_REGISTRY: dict[str, Effect] = {"flip": Flip(), "retarget": Retarget(), "swap": Swap()}
            
def get_effect(id: str) -> Effect:
    return _REGISTRY[id]

def can_modify(effect: Effect, spec: TargetSpec) -> bool:
    match effect:
        case Retarget():
            return effect.can_modify(spec)
        case Flip() | Swap():
            return False
        case _:
            raise ValueError(f"unhandled effect '{effect}'")
        
def accepts(effect: Effect, spec: TargetSpec) -> bool:
    match effect:
        case Flip():
            return not isinstance(spec, ChooseCard)
        case Retarget():
            return isinstance(spec, ChooseCard)
        case Swap():
            return isinstance(spec, ChooseAdjacent) and spec.count == 2
        case _:
            raise ValueError(f"unhandled effect '{effect}'")
        
def can_target(effect: Effect, board: Board, coord: Coord) -> bool:
    match effect:
        case Flip():
            return board.get(coord).type.can_flip and board.get_substrate(coord).is_ready
        case Retarget():
            return False
        case Swap():
            return board.get(coord).type.can_swap
        case _:
            raise ValueError(f"unhandled effect {effect}")