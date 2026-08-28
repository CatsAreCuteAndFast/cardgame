import pygame
from game.view.board_layout import BoardLayout
from game.core.board import Board
from game.view.screen_layout import ScreenLayout
from game.view.game_renderer import GameRenderer
from game.rules.level import Level, make_demo_level

WINDOW_SIZE = (800, 600)
BACKGROUND = "black"
FPS = 144

def handle_event(event: pygame.Event, layout: BoardLayout, board: Board):
    if event.type == pygame.MOUSEBUTTONUP and event.button == 1:
        coord = layout.coord_at(event.pos)
        if coord is not None:
            board.get(coord).flip()

def main() -> None:
    pygame.init()
    clock = pygame.time.Clock()
    screen = pygame.display.set_mode(WINDOW_SIZE, pygame.RESIZABLE)

    level = make_demo_level()
    board = level.make_board()
    card_list = level.card_list
    
    layouts = ScreenLayout(screen.get_rect(), board.size, len(card_list))
    game_renderer = GameRenderer()

    running = True
    while running:
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            elif event.type == pygame.VIDEORESIZE:
                layouts = ScreenLayout(screen.get_rect(), board.size, len(card_list))
            handle_event(event, layouts.board, board)
        screen.fill(BACKGROUND)
        game_renderer.draw(screen, layouts, board, card_list)

        pygame.display.flip()
        clock.tick(FPS)
        
    pygame.quit()
    
if __name__ == "__main__":
    main()
    
        