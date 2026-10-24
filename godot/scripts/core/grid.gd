# Grille de cases : collisions, ligne de vue, atténuation du son (port de shared/map/grid.js).
class_name Grid
extends RefCounted

enum { FLOOR = 0, WALL = 1, DOOR = 2, CRACKED = 3, DEBRIS = 4, SHELF = 5, TABLE = 6, GRATE = 7 }

var w: int
var h: int
var tiles: PackedByteArray
var door_open: PackedByteArray
var door_broken: PackedByteArray

func _init(width: int, height: int) -> void:
	w = width
	h = height
	tiles = PackedByteArray()
	tiles.resize(w * h)
	tiles.fill(WALL)
	door_open = PackedByteArray()
	door_open.resize(w * h)
	door_broken = PackedByteArray()
	door_broken.resize(w * h)

func idx(x: int, y: int) -> int:
	return y * w + x

func in_bounds(x: int, y: int) -> bool:
	return x >= 0 and y >= 0 and x < w and y < h

func get_t(x: int, y: int) -> int:
	return tiles[y * w + x] if in_bounds(x, y) else WALL

func set_t(x: int, y: int, v: int) -> void:
	if in_bounds(x, y):
		tiles[y * w + x] = v

func blocks_move(x: int, y: int) -> bool:
	if not in_bounds(x, y):
		return true
	var i = y * w + x
	var t: int = tiles[i]
	if t == DOOR:
		return door_open[i] == 0
	return t == WALL or t == CRACKED or t == SHELF or t == TABLE

func blocks_sight(x: int, y: int) -> bool:
	if not in_bounds(x, y):
		return true
	var i = y * w + x
	var t: int = tiles[i]
	if t == DOOR:
		return door_open[i] == 0
	return t == WALL or t == CRACKED or t == SHELF

func sound_cost(x: int, y: int) -> float:
	if not in_bounds(x, y):
		return 99.0
	var i = y * w + x
	var t: int = tiles[i]
	if t == WALL or t == CRACKED:
		return 2.6
	if t == DOOR:
		return 0.0 if door_open[i] == 1 else 1.4
	if t == SHELF:
		return 0.8
	return 0.0

# Parcours DDA : callback(tx, ty, t) -> bool (true pour s'arrêter). Retourne la distance.
func traverse(x0: float, y0: float, x1: float, y1: float, callback: Callable) -> float:
	var dx = x1 - x0
	var dy = y1 - y0
	var length = sqrt(dx * dx + dy * dy)
	if length < 1e-6:
		return 0.0
	var dir_x = dx / length
	var dir_y = dy / length
	var tx = int(floor(x0))
	var ty = int(floor(y0))
	var step_x: int = 1 if dir_x > 0 else -1
	var step_y: int = 1 if dir_y > 0 else -1
	var t_delta_x: float = absf(1.0 / dir_x) if dir_x != 0.0 else INF
	var t_delta_y: float = absf(1.0 / dir_y) if dir_y != 0.0 else INF
	var t_max_x: float = ((tx + 1 - x0) if dir_x > 0 else (x0 - tx)) * t_delta_x if dir_x != 0.0 else INF
	var t_max_y: float = ((ty + 1 - y0) if dir_y > 0 else (y0 - ty)) * t_delta_y if dir_y != 0.0 else INF
	var t = 0.0
	var guard = 0
	while t <= length and guard < 512:
		guard += 1
		if callback.call(tx, ty, t):
			return t
		if t_max_x < t_max_y:
			t = t_max_x
			t_max_x += t_delta_x
			tx += step_x
		else:
			t = t_max_y
			t_max_y += t_delta_y
			ty += step_y
	return length

func has_los(x0: float, y0: float, x1: float, y1: float) -> bool:
	var tx1 = int(floor(x1))
	var ty1 = int(floor(y1))
	var state = {"clear": true}
	traverse(x0, y0, x1, y1, func(tx, ty, _t):
		if tx == tx1 and ty == ty1:
			return true
		if blocks_sight(tx, ty):
			state.clear = false
			return true
		return false)
	return state.clear

func cast_ray(x0: float, y0: float, angle: float, max_dist: float) -> float:
	var x1 = x0 + cos(angle) * max_dist
	var y1 = y0 + sin(angle) * max_dist
	var sx = int(floor(x0))
	var sy = int(floor(y0))
	var state = {"hit": max_dist}
	traverse(x0, y0, x1, y1, func(tx, ty, t):
		if (tx != sx or ty != sy) and blocks_sight(tx, ty):
			state.hit = t
			return true
		return false)
	return minf(state.hit, max_dist)

func sound_obstruction(x0: float, y0: float, x1: float, y1: float) -> float:
	var sx = int(floor(x0))
	var sy = int(floor(y0))
	var ex = int(floor(x1))
	var ey = int(floor(y1))
	var state = {"cost": 0.0}
	traverse(x0, y0, x1, y1, func(tx, ty, _t):
		if (tx == sx and ty == sy) or (tx == ex and ty == ey):
			return false
		state.cost += sound_cost(tx, ty)
		return state.cost > 40.0)
	return state.cost

func collides(x: float, y: float, r: float) -> bool:
	var min_x = int(floor(x - r))
	var max_x = int(floor(x + r))
	var min_y = int(floor(y - r))
	var max_y = int(floor(y + r))
	for ty in range(min_y, max_y + 1):
		for tx in range(min_x, max_x + 1):
			if not blocks_move(tx, ty):
				continue
			var cx: float = clampf(x, tx, tx + 1)
			var cy: float = clampf(y, ty, ty + 1)
			if (x - cx) * (x - cx) + (y - cy) * (y - cy) < r * r:
				return true
	return false

# Déplacement d'un cercle avec collisions séparées par axe → {x, y, hit_x, hit_y}
func move_circle(x: float, y: float, dx: float, dy: float, r: float) -> Dictionary:
	var hit_x = false
	var hit_y = false
	var steps: int = maxi(1, int(ceil(maxf(absf(dx), absf(dy)) / 0.25)))
	var sx = dx / steps
	var sy = dy / steps
	for _s in steps:
		var nx = x + sx
		if collides(nx, y, r):
			hit_x = true
			nx = x
		x = nx
		var ny = y + sy
		if collides(x, ny, r):
			hit_y = true
			ny = y
		y = ny
	return {"x": x, "y": y, "hit_x": hit_x, "hit_y": hit_y}

func unstick(x: float, y: float, r: float) -> Vector2:
	if not collides(x, y, r):
		return Vector2(x, y)
	var rad = 0.25
	while rad < 4.0:
		var a = 0.0
		while a < TAU:
			var nx = x + cos(a) * rad
			var ny = y + sin(a) * rad
			if not collides(nx, ny, r):
				return Vector2(nx, ny)
			a += PI / 8.0
		rad += 0.25
	return Vector2(x, y)
