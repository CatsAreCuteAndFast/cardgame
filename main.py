import pygame
from game.view.layout import Layout
from game.levels import demo_board
from game.view.board_renderer import BoardRenderer
from game.core.board import Board
from game.view.hand_layout import HandLayout
from game.view.hand_renderer import HandRenderer
from game.rules.cardtype import get_type

WINDOW_SIZE = (800, 600)
BACKGROUND = "black"
FPS = 144
HAND_FRACTION = 0.25

def make_layout(board_rect: pygame.Rect, hand_rect: pygame.Rect, board: Board) -> tuple[Layout, HandLayout]:
    return Layout(board_rect, board.size, gap_ratio=0.05), HandLayout(hand_rect, 3)

def handle_event(event: pygame.Event, layout: Layout, board: Board):
    if event.type == pygame.MOUSEBUTTONUP and event.button == 1:
        coord = layout.coord_at(event.pos)
        if coord is not None:
            board.get(coord).flip()
            
def split_screen(screen: pygame.Surface) -> tuple[pygame.Rect, pygame.Rect]:
    full = screen.get_rect()
    
    hand_height = int(full.height * HAND_FRACTION)
    board_height = full.height - hand_height
    
    board_rect = pygame.Rect(full.x, full.y, full.width, board_height)
    hand_rect = pygame.Rect(full.x, board_rect.bottom, full.width, hand_height)
    
    return board_rect, hand_rect

def main() -> None:
    pygame.init()
    clock = pygame.time.Clock()
    screen = pygame.display.set_mode(WINDOW_SIZE, pygame.RESIZABLE)

    demo = demo_board()
    
    board_rect, hand_rect = split_screen(screen)
    layout, hand_layout = make_layout(board_rect, hand_rect, demo)
    board_renderer = BoardRenderer()
    hand_renderer = HandRenderer()
    
    card_list = [get_type("flip"), get_type("flip"), get_type("flip")]

    running = True
    while running:
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            elif event.type == pygame.VIDEORESIZE:
                board_rect, hand_rect = split_screen(screen)
                layout, hand_layout = make_layout(board_rect, hand_rect, demo)
            handle_event(event, layout, demo)
        screen.fill(BACKGROUND)
        board_renderer.draw(screen, layout, demo)
        hand_renderer.draw(screen, hand_layout, card_list)

        pygame.display.flip()
        clock.tick(FPS)
        
    pygame.quit()
    
if __name__ == "__main__":
    main()
    
        