import ast
from pathlib import Path

FORBIDDEN = "pygame"
PACKAGES = ("game/core", "game/rules")
ROOT = Path(__file__).parent


def _imported_roots(path: Path) -> set[str]:
    """Top-level package name of every module this file imports."""
    tree = ast.parse(path.read_text(), filename=str(path))
    roots: set[str] = set()
    for node in ast.walk(tree):
        match node:
            case ast.Import(names=names):
                roots.update(alias.name.split(".")[0] for alias in names)
            case ast.ImportFrom(module=str() as module, level=0):
                roots.add(module.split(".")[0])
    return roots


def test_no_pygame_in_logic_layers() -> None:
    for package in PACKAGES:
        for path in sorted((ROOT / package).glob("*.py")):
            assert FORBIDDEN not in _imported_roots(path), (
                f"{path.relative_to(ROOT)} imports {FORBIDDEN}"
            )


if __name__ == "__main__":
    test_no_pygame_in_logic_layers()
    print("ok: no pygame in", ", ".join(PACKAGES))