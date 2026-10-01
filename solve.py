import sys
from game.rules.level_io import load_level
from game.rules.solver import solve, Solved, Unsolvable, GaveUp, DEFAULT_MAX_STATES

def main() -> None:
    if not 2 <= len(sys.argv) <= 3:
        sys.exit("usage: python solve.py levels/<name>.json [max_states]")
    max_states = int(sys.argv[2]) if len(sys.argv) == 3 else DEFAULT_MAX_STATES
    result = solve(load_level(sys.argv[1]), max_states)
    match result:
        case Solved(steps=steps, solutions=solutions, counted_all=counted_all, states=states):
            count = solutions if counted_all else f"at least {solutions}"
            print(f"solvable in {len(steps)} plays, {count} optimal solutions ({states} positions)")
            for number, step in enumerate(steps, 1):
                move = step.move
                picks = " ".join(f"({c.row},{c.col})" for c in move.coords)
                target = "" if move.target is None else " ".join(move.target.label.split())
                print(f"{number}. {' '.join(move.card.label.split())} {picks}{target}".rstrip())
        case Unsolvable(reason=reason, states=states):
            print(f"unsolvable: {reason} ({states} positions)")
        case GaveUp(searched=searched, states=states):
            print(f"no solution in {searched} plays or fewer, stopped after {states} positions")
        case _:
            raise ValueError(f"unhandled result {result}")

if __name__ == "__main__":
    main()
