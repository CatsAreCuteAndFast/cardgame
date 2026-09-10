from dataclasses import dataclass
from game.core.substratetype import SubstrateType

@dataclass
class Substrate:
    type: SubstrateType
    counter: int = 0
    
    def __post_init__(self) -> None:
        self.counter = self.type.period

    def tick(self) -> None:
        if self.type.period == 0:
            return
        if self.counter == 0:
            self.counter = self.type.period
        else:
            self.counter -= 1
