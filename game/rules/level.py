from dataclasses import dataclass
from game.core.tiletype import get_type as get_tile_type
from game.core.tile import Tile
from game.rules.card import Card
from game.core.board import Board
from game.rules.targets import ChooseAny, ChooseFrom, Fixed, ChooseCard, ChooseAdjacent
from game.core.coord import Coord
from game.rules.effects import get_effect, accepts

PLAY_BUDGET = 1000
CARD_LIST = (Card("flip", Fixed((Coord(0, 1), Coord(2, 2)))), Card("flip", ChooseFrom((Coord(1, 1), Coord(2, 0), Coord(2, 2)))), Card("flip", ChooseAny(2)), Card("retarget", ChooseCard()), Card("swap", ChooseAdjacent()))
TILE_LIST = (("basic", "basic", "notflippable"),
             ("basic", "notswappable", "basic"),
             ("basic", "notflippable", "notswappable"))
LINKED_LIST = ((Coord(0, 1), Coord(2, 0)),)
SIZE = (5, 5)
def filled_tile_list() -> tuple[tuple[str, ...], ...]:
    width, height = SIZE
    return tuple(("basic",) * width for _ in range(height))
TEST_TILE_LIST = filled_tile_list()

@dataclass(frozen=True)
class Level:
    play_budget: int
    card_list: tuple[Card, ...]
    tile_list: tuple[tuple[str, ...], ...]
    linked_list: tuple[tuple[Coord, ...], ...] = ()
    
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
            try:
                effect = get_effect(card.effect_id)
            except KeyError:
                raise ValueError(f"Unknown effect '{card.effect_id}' at index {index}") from None
            if not accepts(effect, card.targets):
                raise ValueError(f"effect {effect} doesnt accept targeting of type {card.targets}")
            self._check_targets(card, index)
            
        self._check_links()
            
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
            case ChooseCard():
                return
            case Fixed(coords=coords):
                check(coords)
            case ChooseFrom(coords=coords):
                check(coords)
            case ChooseAny(count=count) | ChooseAdjacent(count=count):
                if not 1 <= count <= width * height:
                    raise ValueError(
                        f"card {index} picks {count} from a {width*height}-tile board"
                    )
            case _:
                raise ValueError(f"undocumented case {card.targets}")
            
    def _check_links(self) -> None:
        width, height = self.size
        seen: set[Coord] = set()
        for index, group in enumerate(self.linked_list):
            if len(group) < 2:
                raise ValueError(f"linked group {index} has {len(group)} members, must have at least 2")
            for coord in group:
                if not (0 <= coord.row < height and 0 <= coord.col < width):
                    raise ValueError(f"link group{index} has {coord}, which is out of bounds {width}x{height}")
                if coord in seen:
                    raise ValueError(f"{coord} appears in more than one linked group")
                seen.add(coord)
                
    def make_board(self) -> Board:
        width, height = self.size
        
        link_of = {
            coord: str(index)
            for index, group in enumerate(self.linked_list)
            for coord in group
        }
        
        board_tile_list = [
            Tile(get_tile_type(tile_id), link=link_of.get(Coord(row_index, col_index)))
            for row_index, row in enumerate(self.tile_list)
            for col_index, tile_id in enumerate(row)
        ]
        return Board((width, height), board_tile_list)
        
def make_demo_level() -> Level:
    return Level(PLAY_BUDGET, CARD_LIST, TILE_LIST, linked_list=LINKED_LIST)