from dataclasses import dataclass

@dataclass(frozen=True)
class SubstrateType:
    id: str
    period: int

PLAIN = SubstrateType("plain", 0)
ONETURN = SubstrateType("oneturn", 1)
TWOTURN = SubstrateType("twoturn", 2)

_REGISTRY = {substrate.id: substrate for substrate in (PLAIN, ONETURN, TWOTURN)}

def get_substrate_type(id: str) -> SubstrateType:
    return _REGISTRY[id]

def substrate_type_ids() -> tuple[str, ...]:
    return tuple(_REGISTRY)
