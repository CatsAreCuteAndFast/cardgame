import pygame
from sys import exit as sysexit
from game.view.layout import Layout
from levels import demo_board
from game.core.board import Board
from game.core.coord import Coord
from game.view.board_renderer import BoardRenderer

pygame.init()
clock = pygame.time.Clock()
screen = pygame.display.set_mode((800, 600), pygame.RESIZABLE)

demo = demo_board()
layout = Layout(screen.get_rect(), (demo.width, demo.height))
test_rect = layout.rect_for(Coord(0, 0))
test_pos = layout.coord_at(test_rect.center)
board_renderer = BoardRenderer()

while True:
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            pygame.quit()
            sysexit()
         
    screen.fill("black")
    board_renderer.draw(screen, layout, demo)

    pygame.display.flip()
    clock.tick(144)
    
        