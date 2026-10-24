# A* sur la grille (8 directions, sans couper les coins) + distances BFS.
# Port de shared/map/pathfinding.js.
class_name Pathfinding
extends RefCounted

const DIRS := [[1, 0, 1.0], [-1, 0, 1.0], [0, 1, 1.0], [0, -1, 1.0], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]]


static func _passable(grid: Grid, tx: int, ty: int, doors_passable: bool) -> bool:
	if not grid.in_bounds(tx, ty):
		return false
	var i := ty * grid.w + tx
	if grid.tiles[i] == Grid.DOOR:
		return doors_passable or grid.door_open[i] == 1
	return not grid.blocks_move(tx, ty)


# Retourne un tableau de Vector2 (centres de cases), ou [] si aucun chemin.
static func find_path(grid: Grid, sx: float, sy: float, gx: float, gy: float, doors_passable := true, max_nodes := 4000, avoid := Callable()) -> Array:
	var w := grid.w
	var start := int(floor(sy)) * w + int(floor(sx))
	var goal := int(floor(gy)) * w + int(floor(gx))
	if not _passable(grid, goal % w, goal / w, doors_passable):
		goal = _nearest_passable(grid, goal % w, goal / w, doors_passable)
		if goal < 0:
			return []
	if start == goal:
		return [Vector2(goal % w + 0.5, goal / w + 0.5)]
	var gx_t := goal % w
	var gy_t := goal / w
	var g_score := {start: 0.0}
	var came := {}
	var closed := {}
	var heap := MinHeap.new()
	heap.push(start, _heur(start, w, gx_t, gy_t))
	var expanded := 0
	while heap.size() > 0:
		var cur: int = heap.pop()
		if cur == goal:
			break
		if closed.has(cur):
			continue
		closed[cur] = true
		expanded += 1
		if expanded > max_nodes:
			return []
		var cx := cur % w
		var cy := cur / w
		for d in DIRS:
			var nx: int = cx + d[0]
			var ny: int = cy + d[1]
			if not _passable(grid, nx, ny, doors_passable):
				continue
			if d[0] != 0 and d[1] != 0 and (not _passable(grid, cx + d[0], cy, doors_passable) or not _passable(grid, cx, cy + d[1], doors_passable)):
				continue
			var ni := ny * w + nx
			var cost: float = d[2]
			if grid.tiles[ni] == Grid.DOOR and grid.door_open[ni] == 0:
				cost += 2.0
			if avoid.is_valid():
				cost += float(avoid.call(nx, ny))
			var ng: float = g_score[cur] + cost
			if ng < g_score.get(ni, INF):
				g_score[ni] = ng
				came[ni] = cur
				heap.push(ni, ng + _heur(ni, w, gx_t, gy_t))
	if not came.has(goal):
		return []
	var path := []
	var c := goal
	while c != start:
		path.push_front(Vector2(c % w + 0.5, c / w + 0.5))
		c = came[c]
	return _smooth(grid, sx, sy, path)


static func _heur(i: int, w: int, gx: int, gy: int) -> float:
	var dx: float = absi(i % w - gx)
	var dy: float = absi(i / w - gy)
	return maxf(dx, dy) + 0.414 * minf(dx, dy)


static func _nearest_passable(grid: Grid, tx: int, ty: int, doors_passable: bool) -> int:
	for r in range(1, 6):
		for dy in range(-r, r + 1):
			for dx in range(-r, r + 1):
				if _passable(grid, tx + dx, ty + dy, doors_passable):
					return (ty + dy) * grid.w + (tx + dx)
	return -1


static func _smooth(grid: Grid, sx: float, sy: float, path: Array) -> Array:
	if path.size() < 3:
		return path
	var out := []
	var ax := sx
	var ay := sy
	var i := 0
	while i < path.size():
		var j := path.size() - 1
		while j > i:
			if _clear_corridor(grid, ax, ay, path[j].x, path[j].y):
				break
			j -= 1
		out.append(path[j])
		ax = path[j].x
		ay = path[j].y
		i = j + 1
	return out


static func _clear_corridor(grid: Grid, x0: float, y0: float, x1: float, y1: float) -> bool:
	var length := Vector2(x1 - x0, y1 - y0).length()
	var steps := int(ceil(length / 0.3))
	var nlen := length if length > 0.0 else 1.0
	var nx := -(y1 - y0) / nlen
	var ny := (x1 - x0) / nlen
	for s in range(steps + 1):
		var t := float(s) / float(max(1, steps))
		var px := x0 + (x1 - x0) * t
		var py := y0 + (y1 - y0) * t
		for off in [-0.42, 0.0, 0.42]:
			var qx := int(floor(px + nx * off))
			var qy := int(floor(py + ny * off))
			if grid.blocks_move(qx, qy) and grid.get_t(qx, qy) != Grid.DOOR:
				return false
	return true


# Distances BFS (4 directions) depuis (sx, sy). pass_fn(x, y) -> bool facultatif.
static func flood(grid: Grid, sx: int, sy: int, pass_fn := Callable()) -> PackedInt32Array:
	var w := grid.w
	var h := grid.h
	var d := PackedInt32Array()
	d.resize(w * h)
	d.fill(-1)
	var q := PackedInt32Array()
	q.resize(w * h)
	var qh := 0
	var qt := 0
	var s := sy * w + sx
	d[s] = 0
	q[qt] = s
	qt += 1
	while qh < qt:
		var c := q[qh]
		qh += 1
		var cx := c % w
		var cy := c / w
		for dd in [[1, 0], [-1, 0], [0, 1], [0, -1]]:
			var nx: int = cx + dd[0]
			var ny: int = cy + dd[1]
			if nx < 0 or ny < 0 or nx >= w or ny >= h:
				continue
			var ni := ny * w + nx
			if d[ni] != -1:
				continue
			var ok: bool
			if pass_fn.is_valid():
				ok = pass_fn.call(nx, ny)
			else:
				ok = grid.get_t(nx, ny) == Grid.DOOR or not grid.blocks_move(nx, ny)
			if not ok:
				continue
			d[ni] = d[c] + 1
			q[qt] = ni
			qt += 1
	return d


class MinHeap:
	var items: Array = []
	var prio: Array = []

	func size() -> int:
		return items.size()

	func push(item, p: float) -> void:
		items.append(item)
		prio.append(p)
		var i := items.size() - 1
		while i > 0:
			var parent := (i - 1) >> 1
			if prio[parent] <= prio[i]:
				break
			_swap(i, parent)
			i = parent

	func pop():
		var top = items[0]
		var last_item = items.pop_back()
		var last_p = prio.pop_back()
		if items.size() > 0:
			items[0] = last_item
			prio[0] = last_p
			var i := 0
			while true:
				var l := i * 2 + 1
				var r := l + 1
				var m := i
				if l < items.size() and prio[l] < prio[m]:
					m = l
				if r < items.size() and prio[r] < prio[m]:
					m = r
				if m == i:
					break
				_swap(i, m)
				i = m
		return top

	func _swap(a: int, b: int) -> void:
		var t = items[a]
		items[a] = items[b]
		items[b] = t
		var tp = prio[a]
		prio[a] = prio[b]
		prio[b] = tp
