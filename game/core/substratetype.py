from dataclasses import dataclass

@dataclass(frozen=True)
class SubstrateType:
    id: str
    period: int

PLAIN = SubstrateType("plain", 0)
ONETURN = SubstrateType("oneturn", 1)
TWOTURN = SubstrateType("twoturn", 2)

_REGISTRY = {substrate.id: substrate for substrate in (ONETURN, TWOTURN, PLAIN)}

def get_substrate_type(id: str) -> SubstrateType:
    return _REGISTRY[id]