from collections import Counter
from collections.abc import Generator
from dataclasses import dataclass
from game.core.board import Board
from game.core.coord import Coord
from game.core.tile import Tile
from game.core.tiletype import get_tile_type
from game.rules.card import Card
from game.rules.level import Level
from game.rules.game_state import GameState
from game.rules.game_controller import GameController
from game.rules.intents import Intent, ClickedCard, ClickedTile
from game.rules.effects import get_effect, can_modify, can_target, Flip
from game.rules.targets import Fixed, ChooseFrom, ChooseAny, ChooseAdjacent, ChooseCard, is_candidate, required_coords

DEFAULT_MAX_STATES = 200_000
_PROGRESS_EVERY = 500

@dataclass(frozen=True)
class Move:
    card: Card
    coords: tuple[Coord, ...] = ()
    target: Card | None = None

@dataclass(frozen=True)
class Step:
    move: Move
    intents: tuple[Intent, ...]

@dataclass(frozen=True)
class Solved:
    steps: tuple[Step, ...]
    solutions: int
    counted_all: bool
    states: int

@dataclass(frozen=True)
class Unsolvable:
    reason: str
    states: int

@dataclass(frozen=True)
class GaveUp:
    searched: int
    states: int

type SolveResult = Solved | Unsolvable | GaveUp

type _Key = tuple[bytes, bytes, tuple[int, ...], tuple[tuple[int, int], ...]]

def solve(level: Level, max_states: int = DEFAULT_MAX_STATES) -> SolveResult:
    search = search_level(level, max_states)
    while True:
        try:
            next(search)
        except StopIteration as stop:
            return stop.value

def search_level(level: Level, max_states: int = DEFAULT_MAX_STATES) -> Generator[int, None, SolveResult]:
    reason = _impossible(level)
    if reason is not None:
        return Unsolvable(reason, 0)
    return (yield from _Search(level, max_states).run())

def intents_for(hand: list[Card], move: Move) -> tuple[Intent, ...]:
    index = hand.index(move.card)
    intents: list[Intent] = [ClickedCard(index), ClickedCard(index)]
    intents.extend(ClickedTile(coord) for coord in move.coords)
    if move.target is not None:
        intents.append(ClickedCard(hand.index(move.target)))
    return tuple(intents)

def _impossible(level: Level) -> str | None:
    if not any(isinstance(get_effect(card.effect_id), Flip) for card in level.card_list):
        return "no card can flip tiles"
    board = level.make_board()
    flippable_links = {tile.link for _, tile in board.iterate_tiles() if tile.type.can_flip and tile.link is not None}
    for coord, tile in board.iterate_tiles():
        if not tile.is_flipped and not tile.type.can_flip and tile.link not in flippable_links:
            return f"tile ({coord.row},{coord.col}) can never be flipped"
    return None

def _play(state: GameState, move: Move) -> GameState | None:
    child = state.copy()
    controller = GameController(child)
    for intent in intents_for(child.hand, move):
        controller.handle(intent)
    return child if child.plays_remaining < state.plays_remaining else None

def _pick_sets(card: Card, board: Board) -> list[tuple[Coord, ...]]:
    effect = get_effect(card.effect_id)
    need = required_coords(card.targets)
    allowed = [coord for coord, _ in board.iterate_tiles() if can_target(effect, board, coord)]
    seen: set[frozenset[Coord]] = set()
    found: list[tuple[Coord, ...]] = []

    def grow(picked: tuple[Coord, ...]) -> None:
        picked_set = frozenset(picked)
        if picked_set in seen:
            return
        seen.add(picked_set)
        if len(picked) == need:
            found.append(picked)
            return
        for coord in allowed:
            if is_candidate(card.targets, picked, coord):
                grow(picked + (coord,))

    grow(())
    return found

def _moves(state: GameState) -> list[Move]:
    moves: list[Move] = []
    distinct = list(dict.fromkeys(state.hand))
    for card in distinct:
        match card.targets:
            case Fixed():
                moves.append(Move(card))
            case ChooseFrom() | ChooseAny() | ChooseAdjacent():
                moves.extend(Move(card, picks) for picks in _pick_sets(card, state.board))
            case ChooseCard():
                effect = get_effect(card.effect_id)
                moves.extend(Move(card, target=other) for other in distinct if can_modify(effect, other.targets))
            case _:
                raise ValueError(f"unhandled target {card.targets}")
    return moves

class _Search:
    def __init__(self, level: Level, max_states: int) -> None:
        self.level = level
        self.max_states = max_states
        self.start = GameState(level)
        self.tile_codes: dict[tuple[str, bool, str | None], int] = {}
        self.tiles: list[tuple[str, bool, str | None]] = []
        self.card_codes: dict[Card, int] = {}
        self.cards: list[Card] = []

    def _tile_code(self, tile: Tile) -> int:
        signature = (tile.type.id, tile.is_flipped, tile.link)
        if signature not in self.tile_codes:
            self.tile_codes[signature] = len(self.tiles)
            self.tiles.append(signature)
        return self.tile_codes[signature]

    def _card_code(self, card: Card) -> int:
        if card not in self.card_codes:
            self.card_codes[card] = len(self.cards)
            self.cards.append(card)
        return self.card_codes[card]

    def _key(self, state: GameState) -> _Key:
        persistent: set[int] = set()
        single: Counter[int] = Counter()
        for card in state.hand:
            code = self._card_code(card)
            if card.single_use:
                single[code] += 1
            else:
                persistent.add(code)
        return (
            bytes(self._tile_code(tile) for tile in state.board.tiles),
            bytes(substrate.counter for substrate in state.board.substrates),
            tuple(sorted(persistent)),
            tuple(sorted(single.items())),
        )

    def _restore(self, key: _Key, plays_remaining: int) -> GameState:
        tiles, counters, persistent, single = key
        state = self.start.copy()
        board = state.board
        board.tiles = [Tile(get_tile_type(type_id), flipped, link) for type_id, flipped, link in (self.tiles[code] for code in tiles)]
        for substrate, counter in zip(board.substrates, counters):
            substrate.counter = counter
        state.hand = [self.cards[code] for code in persistent] + [self.cards[code] for code, count in single for _ in range(count)]
        state.plays_remaining = plays_remaining
        return state

    def run(self) -> Generator[int, None, SolveResult]:
        budget = self.level.play_budget
        start_key = self._key(self.start)
        parents: dict[_Key, tuple[_Key, Move] | None] = {start_key: None}
        layer: dict[_Key, int] = {start_key: 1}
        expanded = 0
        for depth in range(1, budget + 1):
            next_layer: dict[_Key, int] = {}
            wins: list[_Key] = []
            for key, count in layer.items():
                state = self._restore(key, budget - depth + 1)
                children: dict[_Key, tuple[Move, bool]] = {}
                for move in _moves(state):
                    child = _play(state, move)
                    if child is None:
                        continue
                    child_key = self._key(child)
                    if child_key not in children:
                        children[child_key] = (move, child.is_won)
                for child_key, (move, won) in children.items():
                    if child_key in next_layer:
                        next_layer[child_key] += count
                    elif child_key not in parents:
                        parents[child_key] = (key, move)
                        next_layer[child_key] = count
                        if won:
                            wins.append(child_key)
                if len(parents) > self.max_states:
                    if wins:
                        return Solved(self._steps(parents, wins[0]), sum(next_layer[key] for key in wins), False, len(parents))
                    return GaveUp(depth - 1, len(parents))
                expanded += 1
                if expanded % _PROGRESS_EVERY == 0:
                    yield len(parents)
            if wins:
                return Solved(self._steps(parents, wins[0]), sum(next_layer[key] for key in wins), True, len(parents))
            if not next_layer:
                return Unsolvable(f"every reachable position was checked within {depth - 1} plays", len(parents))
            layer = next_layer
        return Unsolvable(f"no solution within the play budget ({budget})", len(parents))

    def _steps(self, parents: dict[_Key, tuple[_Key, Move] | None], key: _Key) -> tuple[Step, ...]:
        moves: list[Move] = []
        link = parents[key]
        while link is not None:
            key, move = link
            moves.append(move)
            link = parents[key]
        state = self.start.copy()
        controller = GameController(state)
        steps: list[Step] = []
        for move in reversed(moves):
            intents = intents_for(state.hand, move)
            for intent in intents:
                controller.handle(intent)
            steps.append(Step(move, intents))
        if not state.is_won:
            raise ValueError("solver produced a solution that does not win")
        return tuple(steps)
