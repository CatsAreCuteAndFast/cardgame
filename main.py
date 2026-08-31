import pygame
from game.view.screen_layout import ScreenLayout
from game.view.game_renderer import GameRenderer
from game.rules.level import make_demo_level
from game.rules.game_state import GameState
from game.rules.game_controller import GameController
from game.input.translate import translate

WINDOW_SIZE = (800, 600)
BACKGROUND = "black"
FPS = 144

def main() -> None:
    pygame.init()
    clock = pygame.time.Clock()
    screen = pygame.display.set_mode(WINDOW_SIZE, pygame.RESIZABLE)

    level = make_demo_level()
    state = GameState(level)
    controller = GameController(state)
    renderer = GameRenderer()

    running = True
    while running:
        layouts = ScreenLayout(screen.get_rect(), state.board.size, len(state.hand))
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            intent = translate(event, layouts)
            if intent is not None:
                controller.handle(intent)
                layouts = ScreenLayout(screen.get_rect(), state.board.size, len(state.hand))
        screen.fill(BACKGROUND)
        renderer.draw(screen, layouts, state.board, state.hand)

        pygame.display.flip()
        clock.tick(FPS)
        
    pygame.quit()
    
if __name__ == "__main__":
    main()
    
        