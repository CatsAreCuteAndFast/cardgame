# prints the light-on/light-off keyframes for editor/editor.css (paste them over the old ones).
# the light circle scales up with an ease-out from START% of the flip; its content gets the inverse scale so it stays still.
# scale steps of at most RATIO keep the error between keyframes (both animate linearly) under 1%
S0, START, END, RATIO = 0.03, 23.0, 45.0, 1.2


def fmt(p: float) -> str:
    return f"{p:.1f}".rstrip("0").rstrip(".") + "%"


def keyframes(name: str, lines: list[str]) -> str:
    return "@keyframes " + name + " {\n" + "\n".join(lines) + "\n}"


def main() -> None:
    scales = []
    s = S0
    while s < 1:
        scales.append(s)
        s *= RATIO
    scales.append(1.0)
    points = [(START + (100 - START) * (1 - (1 - s) ** (1 / 3)), s) for s in scales]
    on_outer = [f"  0% {{ opacity: 0; transform: scale({S0}); }}"]
    on_inner = [f"  0% {{ transform: scale({round(1 / S0, 3)}); }}"]
    for i, (p, s) in enumerate(points):
        on_outer.append(f"  {fmt(p)} {{ opacity: {0 if i == 0 else 1}; transform: scale({s:.4f}); }}")
        on_inner.append(f"  {fmt(p)} {{ transform: scale({1 / s:.4f}); }}")
    off_outer, off_inner = [], []
    for i, (p, s) in enumerate(reversed(points)):
        t = END * (100 - p) / (100 - START)
        off_outer.append(f"  {fmt(t)} {{ opacity: {0 if i == len(points) - 1 else 1}; transform: scale({s:.4f}); }}")
        off_inner.append(f"  {fmt(t)} {{ transform: scale({1 / s:.4f}); }}")
    off_outer.append(f"  100% {{ opacity: 0; transform: scale({S0}); }}")
    off_inner.append(f"  100% {{ transform: scale({round(1 / S0, 3)}); }}")
    print(keyframes("light-on", on_outer))
    print(keyframes("light-on-inner", on_inner))
    print(keyframes("light-off", off_outer))
    print(keyframes("light-off-inner", off_inner))


main()
