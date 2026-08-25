from dataclasses import dataclass

## TODO look at the claude messages and create the data outline for the tiles of the game

@dataclass(frozen=True)
class TileType:
    id: str
    can_flip: bool = True
    
BASIC = TileType("basic")
NOTFLIPPABLE = TileType("notflippable", False)
    
_REGISTRY = {t.id: t for t in (BASIC, NOTFLIPPABLE)}

def get_type(id: str) -> TileType:
    return _REGISTRY[id]