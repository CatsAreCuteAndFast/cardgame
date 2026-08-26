from dataclasses import dataclass
from game.rules.effects import FlipEffect

@dataclass(frozen=True)
class CardType:
    id: str
    effect: FlipEffect
    
FLIP = CardType("flip", FlipEffect())

_REGISTRY = {c.id : c for c in (FLIP, FLIP)}

def get_type(id: str) -> CardType:
    return _REGISTRY[id]