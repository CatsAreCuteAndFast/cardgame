from dataclasses import dataclass

@dataclass(frozen=True)
class TileType:
    id: str
    can_flip: bool = True
    can_swap: bool = True
    
BASIC = TileType("basic")
NOTFLIPPABLE = TileType("notflippable", False)
NOTSWAPPABLE = TileType("notswappable", can_swap=False)
    
_REGISTRY = {t.id: t for t in (BASIC, NOTFLIPPABLE, NOTSWAPPABLE)}

def get_tile_type(id: str) -> TileType:
    return _REGISTRY[id]

def tile_type_ids() -> tuple[str, ...]:
    return tuple(_REGISTRY)
