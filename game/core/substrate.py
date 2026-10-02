from dataclasses import dataclass, field, InitVar
from game.core.substratetype import SubstrateType

@dataclass
class Substrate:
    type: SubstrateType
    start: InitVar[int | None] = None
    counter: int = field(init=False)
    
    def __post_init__(self, start: int | None) -> None:
        self.counter = self.type.period if start is None else start
        if not 0 <= self.counter <= self.type.period:
            raise ValueError(f"{self.type.id} counter must be 0..{self.type.period}, got {self.counter}")
        
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
