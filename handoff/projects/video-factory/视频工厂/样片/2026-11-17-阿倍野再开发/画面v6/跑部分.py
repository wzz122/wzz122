from v6lib import *
skip = {'S09', 'S31', 'S40', 'S68', 'S70', 'S76', 'S77', 'S81', 'S85'}
build_storyboard(quiet=True)
print(render([f'S{i:02d}' for i in range(1, 88) if f'S{i:02d}' not in skip]))
