from dataclasses import dataclass
from game.rules.targets import TargetSpec, describe

@dataclass(frozen=True)
class Card:
    effect_id: str
    targets: TargetSpec
    single_use: bool = False

    @property
    def label(self) -> str:
        return f"{self.effect_id}\n{describe(self.targets)}"