import pygame
from game.view.layout import Layout
from game.levels import demo_board
from game.view.board_renderer import BoardRenderer
from game.core.board import Board

WINDOW_SIZE = (800, 600)
BACKGROUND = "black"
FPS = 144

def make_layout(screen: pygame.Surface, board: Board) -> Layout:
    return Layout(screen.get_rect(), board.size, gap_ratio=0.05)

def main() -> None:
    pygame.init()
    clock = pygame.time.Clock()
    screen = pygame.display.set_mode(WINDOW_SIZE, pygame.RESIZABLE)

    demo = demo_board()
    layout = make_layout(screen, demo)
    board_renderer = BoardRenderer()

    running = True
    while running:
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            elif event.type == pygame.VIDEORESIZE:
                layout = make_layout(screen, demo)
        screen.fill(BACKGROUND)
        board_renderer.draw(screen, layout, demo)

        pygame.display.flip()
        clock.tick(FPS)
        
    pygame.quit()
    
if __name__ == "__main__":
    main()
    
        