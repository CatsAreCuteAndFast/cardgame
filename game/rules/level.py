from dataclasses import dataclass
from game.core.tiletype import get_type as get_tile_type
from game.core.tile import Tile
from game.rules.card import Card
from game.core.board import Board
from game.rules.targets import ChooseAny, ChooseFrom, Fixed
from game.core.coord import Coord
from game.rules.effects import get_effect

PLAY_BUDGET = 3
CARD_LIST = (Card("flip", Fixed((Coord(0, 1), Coord(2, 2)))), )
TILE_LIST = (("basic", "notflippable", "basic"),
             ("basic", "basic", "basic"),
             ("notflippable", "basic", "basic"))

@dataclass(frozen=True)
class Level:
    play_budget: int
    card_list: tuple[Card, ...]
    tile_list: tuple[tuple[str, ...], ...]
    
    @property 
    def size(self) -> tuple[int, int]:
        return (len(self.tile_list[0]), len(self.tile_list))
    
    def __post_init__(self) -> None:
        if not self.tile_list:
            raise ValueError("Level has no tiles")
        
        width, height = self.size
        for row_index, row in enumerate(self.tile_list):
            if len(row) != width:
                raise ValueError(f"row has {len(row)} tiles instead of expected {width}")
            for col_index, tile_id in enumerate(row):
                try:
                    get_tile_type(tile_id)
                except KeyError:
                    raise ValueError(f"unknown tile type '{tile_id}' at {row_index}x{col_index}") from None
                
        for index, card in enumerate(self.card_list):
            self._check_targets(card, index)
            try:
                get_effect(card.effect_id)
            except KeyError:
                raise ValueError(f"Unknown effect '{card.effect_id}' at index {index}") from None
            
    def _check_targets(self, card: Card, index: int) -> None:
        width, height = self.size

        def check(coords: tuple[Coord, ...]) -> None:
            for coord in coords:
                if not (0 <= coord.row < height and 0 <= coord.col < width):
                    raise ValueError(
                        f"card {index} targets {coord}, "
                        f"outside board ({width}x{height})"
                    )

        match card.targets:
            case Fixed(coords=coords):
                check(coords)
            case ChooseFrom(coords=coords, count=count):
                check(coords)
                if not 1 <= count <= len(coords):
                    raise ValueError(
                        f"card {index} picks {count} from {len(coords)} candidates"
                    )
            case ChooseAny(count=count):
                if not 1 <= count <= width * height:
                    raise ValueError(
                        f"card {index} picks {count} from a {width*height}-tile board"
                    )
            case _:
                raise ValueError(f"undocumented case {card.targets}")
            
    def make_board(self) -> Board:
        width = len(self.tile_list[0])
        height = len(self.tile_list)
        
        board_tile_list = [
            Tile(get_tile_type(tile_id))
            for row in self.tile_list
            for tile_id in row
        ]
        return Board((width, height), board_tile_list)
        
def make_demo_level() -> Level:
    return Level(PLAY_BUDGET, CARD_LIST, TILE_LIST)