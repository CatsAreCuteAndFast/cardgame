import pygame
from game.rules.intents import Intent, ClickedCard, ClickedTile, ClickedNothing
from game.view.screen_layout import ScreenLayout

def translate(event: pygame.Event, layouts: ScreenLayout) -> Intent | None:
    if event.type != pygame.MOUSEBUTTONUP or event.button != 1:
        return None

    index = layouts.hand.index_at(event.pos)
    if index is not None:
        return ClickedCard(index)

    coord = layouts.board.coord_at(event.pos)
    if coord is not None:
        return ClickedTile(coord)

    return ClickedNothing()