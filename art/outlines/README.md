# Tile outline: valid + targeted ("Ants that lock")

An outline overlay for game tiles with two states:
- **Valid**: the tile can be chosen by the current effect.
- **Targeted**: the tile is currently selected or hovered.

Open `demo.html` for the reference behavior (hover outlined tiles).

## Contents
- Base tile art: the same files as `../tiles/ember-orange/` (not copied again).
- `outline-valid.svg`, `outline-target.svg`: standalone animated outlines.
- `demo.html`: reference implementation (HTML/CSS).

## Geometry (for a 110px tile; scale proportionally)
- Overlay is 126×126, centered on the tile (8px larger on each side).
- Rounded rect: x 1.5, y 1.5, w 123, h 123, radius 21. No fill; drawn above the tile; doesn't block input.
- `pathLength="420"` on the rect so dashes divide evenly (no corner seam). Dash values below are in these units.

## Color
`#ffffff` for line and glow (`#ffe27a` yellow also tested well).

## Valid (idle loop)
- Stroke width 3, opacity 0.75, dasharray `12 9`.
- `stroke-dashoffset` 0 → -42 (two dash periods), linear, infinite, **2.8s** per loop. Dashes travel clockwise.

## Targeted (lock-on, plays once on entering, then holds)
1. **Lock**: width 5, opacity 1; dasharray `12 9` → `21 0` (gaps close to a solid line) over **0.3s**, `cubic-bezier(.3,1.4,.5,1)`, fill forwards.
2. **Pop** (simultaneous): whole overlay scales 1.18 → 1 and fades 0 → 1 over **0.35s**, `cubic-bezier(.3,1.6,.5,1)`, origin center.
3. **Glow** while targeted: `drop-shadow(0 0 7px <color>)` — in an engine, a ~7px blurred copy of the outline or a glow shader.

## Targeted → valid
Instant switch back; dashes resume marching.

## Summary
| State | Width | Opacity | Dashes | Motion | Glow |
|---|---|---|---|---|---|
| Not valid | – | – | none | – | – |
| Valid | 3 | 0.75 | 12/9 | offset 0→-42, 2.8s loop | – |
| Targeted | 5 | 1 | 12/9 → 21/0, 0.3s | pop 1.18→1, 0.35s | 7px |
