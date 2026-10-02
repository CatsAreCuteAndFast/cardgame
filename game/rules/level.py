from dataclasses import dataclass
from game.core.tiletype import get_tile_type
from game.core.tile import Tile
from game.rules.card import Card
from game.core.board import Board
from game.rules.targets import ChooseAny, ChooseFrom, Fixed, ChooseCard, ChooseAdjacent
from game.core.coord import Coord
from game.rules.effects import get_effect, accepts
from game.core.substrate import Substrate
from game.core.substratetype import get_substrate_type

PLAY_BUDGET = 1000
CARD_LIST = (Card("flip", Fixed((Coord(0, 1), Coord(2, 2)))), Card("flip", ChooseFrom((Coord(1, 1), Coord(2, 0), Coord(2, 2)))), Card("flip", ChooseAny(2)), Card("retarget", ChooseCard()), Card("swap", ChooseAdjacent()))
TILE_LIST = (("basic", "basic", "notflippable"),
             ("basic", "notswappable", "basic"),
             ("basic", "notflippable", "notswappable"))
SUBSTRATE_LIST = (("plain", "plain", "plain"), 
                  ("plain", "oneturn", "twoturn"),
                  ("plain", "oneturn", "plain"))
LINK_GROUPS = ((Coord(0, 1), Coord(2, 0)),)
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
    substrate_list: tuple[tuple[str, ...], ...]
    link_groups: tuple[tuple[Coord, ...], ...] = ()
    flipped: tuple[Coord, ...] = ()
    counters: tuple[tuple[Coord, int], ...] = ()
    
    @property 
    def size(self) -> tuple[int, int]:
        return (len(self.tile_list[0]), len(self.tile_list))
    
    def __post_init__(self) -> None:
        self._check_tiles()
        self._check_substrates()
        self._check_cards()
        self._check_links()
        self._check_flipped()
        self._check_counters()
        
    def _check_tiles(self) -> None:
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
                
    def _check_cards(self) -> None:
        for index, card in enumerate(self.card_list):
            try:
                effect = get_effect(card.effect_id)
            except KeyError:
                raise ValueError(f"Unknown effect '{card.effect_id}' at index {index}") from None
            if not accepts(effect, card.targets):
                raise ValueError(f"card {index}: effect {card.effect_id} doesnt accept targeting of type {card.targets}")
            self._check_targets(card, index)
            
    def _check_substrates(self) -> None:
        width, height = self.size
        if len(self.substrate_list) != height:
            raise ValueError(f"substrate grid has {len(self.substrate_list)} rows, expected {height}")
        
        for row_index, substrate_row in enumerate(self.substrate_list):
            if len(substrate_row) != width:
                raise ValueError(f"row has {len(substrate_row)} substrates instead of expected {width}")
            for col_index, substrate_id in enumerate(substrate_row):
                try:
                    get_substrate_type(substrate_id)
                except KeyError:
                    raise ValueError(f"unknown substrate type '{substrate_id}' at {row_index}x{col_index}") from None
               
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
        for index, group in enumerate(self.link_groups):
            if len(group) < 2:
                raise ValueError(f"linked group {index} has {len(group)} members, must have at least 2")
            for coord in group:
                if not (0 <= coord.row < height and 0 <= coord.col < width):
                    raise ValueError(f"link group{index} has {coord}, which is out of bounds {width}x{height}")
                if coord in seen:
                    raise ValueError(f"{coord} appears in more than one linked group")
                seen.add(coord)
                
    def _check_flipped(self) -> None:
        width, height = self.size
        for coord in self.flipped:
            if not (0 <= coord.row < height and 0 <= coord.col < width):
                raise ValueError(f"flipped tile {coord} is out of bounds {width}x{height}")
        if len(set(self.flipped)) != len(self.flipped):
            raise ValueError("a tile is listed as flipped more than once")
        if len(self.flipped) == width * height:
            raise ValueError("every tile starts flipped, so the level is already solved")

    def _check_counters(self) -> None:
        width, height = self.size
        seen: set[Coord] = set()
        for coord, counter in self.counters:
            if not (0 <= coord.row < height and 0 <= coord.col < width):
                raise ValueError(f"substrate counter {coord} is out of bounds {width}x{height}")
            if coord in seen:
                raise ValueError(f"substrate counter for {coord} is listed more than once")
            seen.add(coord)
            period = get_substrate_type(self.substrate_list[coord.row][coord.col]).period
            if not 0 <= counter <= period:
                raise ValueError(f"substrate counter at {coord} is {counter}, must be 0..{period}")

    def make_board(self) -> Board:
        width, height = self.size
        
        link_of = {
            coord: str(index)
            for index, group in enumerate(self.link_groups)
            for coord in group
        }
        
        flipped = set(self.flipped)
        board_tile_list = [
            Tile(get_tile_type(tile_id), Coord(row_index, col_index) in flipped, link_of.get(Coord(row_index, col_index)))
            for row_index, row in enumerate(self.tile_list)
            for col_index, tile_id in enumerate(row)
        ]
        
        counters = dict(self.counters)
        board_substrate_list = [Substrate(get_substrate_type(substrate_id), counters.get(Coord(row_index, col_index)))
            for row_index, substrate_row in enumerate(self.substrate_list)
            for col_index, substrate_id in enumerate(substrate_row)
        ]
        
        return Board((width, height), board_tile_list, board_substrate_list)
        
def make_demo_level() -> Level:
    return Level(PLAY_BUDGET, CARD_LIST, TILE_LIST, SUBSTRATE_LIST, link_groups=LINK_GROUPS)