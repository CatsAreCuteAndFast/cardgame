from dataclasses import dataclass, field
from game.core.substratetype import SubstrateType

@dataclass
class Substrate:
    type: SubstrateType
    counter: int = field(init=False)
    
    def __post_init__(self) -> None:
        self.counter = self.type.period
        
    @property
    def is_ready(self) -> bool:
        return self.counter == 0

    def tick(self) -> None:
        if self.type.period == 0:
            return
        if self.counter == 0:
            self.counter = self.type.period
        else:
            self.counter -= 1
