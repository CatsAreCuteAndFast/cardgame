from dataclasses import replace
from game.core.board import Board
from game.core.coord import Coord
from game.rules.card import Card
from game.rules.targets import ChooseFrom, Fixed, TargetSpec, ChooseCard, ChooseAdjacent

class Flip:
    def apply(self, board: Board, coords: tuple[Coord, ...]) -> None:
        target_tiles = [board.get(coord) for coord in coords]
        for tile in target_tiles:
            tile.flip()
            
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