# Génération de carte — port fidèle de shared/map/generator.js (même graine = même carte).
class_name MapGen
extends RefCounted


static func generate(theme_id: String, seed_value: int, loot_mul := 1.0) -> Dictionary:
	var themes: Dictionary = Data.db.THEMES
	var theme: Dictionary = themes.get(theme_id, themes.warehouse)
	var rng = Rng.new(seed_value)
	var lay: Dictionary = theme.layout
	var cs: int = int(lay.cellSize)
	var cxn: int = int(lay.cellsX)
	var cyn: int = int(lay.cellsY)
	var corridor_rows: Array = lay.get("corridorRows", [])
	var map_w = cxn * cs + 1
	var map_h = cyn * cs + 1
	var grid = Grid.new(map_w, map_h)
	var parent = []
	for i in cxn * cyn:
		parent.append(i)
	var find = func(i: int) -> int:
		var r = i
		while parent[r] != r:
			r = parent[r]
		var c = i
		while parent[c] != r:
			var nxt: int = parent[c]
			parent[c] = r
			c = nxt
		return r
	var union = func(a: int, b: int) -> void:
		parent[find.call(a)] = find.call(b)

	# 1. creuser l'intérieur des cellules
	for cy in cyn:
		for cx in cxn:
			for y in range(cy * cs + 1, cy * cs + cs):
				for x in range(cx * cs + 1, cx * cs + cs):
					grid.set_t(x, y, Grid.FLOOR)

	var open_wall = func(a: int, b: int, mode: String):
		var ax = a % cxn
		var ay = a / cxn
		var bx = b % cxn
		var by = b / cxn
		var cells = []
		if ay == by:
			var x = maxi(ax, bx) * cs
			for y in range(ay * cs + 1, ay * cs + cs):
				cells.append([x, y])
		else:
			var y2 = maxi(ay, by) * cs
			for x2 in range(ax * cs + 1, ax * cs + cs):
				cells.append([x2, y2])
		if mode == "merge":
			for c in cells:
				grid.set_t(c[0], c[1], Grid.FLOOR)
			return null
		var k = 2 if mode == "wide" else 1
		var start = rng.int_range(1, cells.size() - 1 - k)
		var placed = []
		for i in k:
			var c2: Array = cells[start + i]
			var tile = Grid.DOOR if mode == "door" else (Grid.CRACKED if mode == "crack" else Grid.FLOOR)
			grid.set_t(c2[0], c2[1], tile)
			placed.append(c2)
		if mode == "crack":
			for c3 in cells:
				if grid.get_t(c3[0], c3[1]) == Grid.WALL and rng.chance(0.5):
					grid.set_t(c3[0], c3[1], Grid.CRACKED)
		return placed

	# 2. couloirs (hôtel)
	for row in corridor_rows:
		if int(row) >= cyn:
			continue
		for cx in cxn - 1:
			open_wall.call(int(row) * cxn + cx, int(row) * cxn + cx + 1, "merge")
			union.call(int(row) * cxn + cx, int(row) * cxn + cx + 1)

	var group_size = func() -> Dictionary:
		var m = {}
		for i in cxn * cyn:
			var g: int = find.call(i)
			m[g] = m.get(g, 0) + 1
		return m

	# 3. fusions aléatoires (max 3 cellules)
	for cy in cyn:
		for cx in cxn:
			if _has_num(corridor_rows, cy):
				continue
			var a = cy * cxn + cx
			var options = []
			if cx + 1 < cxn and not _has_num(corridor_rows, cy):
				options.append(cy * cxn + cx + 1)
			if cy + 1 < cyn and not _has_num(corridor_rows, cy + 1):
				options.append((cy + 1) * cxn + cx)
			for b in options:
				if find.call(a) == find.call(b):
					continue
				var sizes: Dictionary = group_size.call()
				if int(sizes.get(find.call(a), 1)) + int(sizes.get(find.call(b), 1)) > 3:
					continue
				if rng.chance(float(lay.mergeChance)):
					open_wall.call(a, b, "merge")
					union.call(a, b)

	# 4. cellule de départ
	var start_cell = (cyn - 1) * cxn + rng.int_range(0, cxn - 1)

	# 5. arbre couvrant
	var neighbors = func(c: int) -> Array:
		var cx = c % cxn
		var cy = c / cxn
		var out = []
		if cx > 0:
			out.append(c - 1)
		if cx < cxn - 1:
			out.append(c + 1)
		if cy > 0:
			out.append(c - cxn)
		if cy < cyn - 1:
			out.append(c + cxn)
		return out
	var links = []
	var visited = {find.call(start_cell): true}
	var frontier = []
	var push_frontier = func(g: int) -> void:
		for c in cxn * cyn:
			if find.call(c) == g:
				for n in neighbors.call(c):
					if find.call(n) != g:
						frontier.append([c, n])
	push_frontier.call(find.call(start_cell))
	while frontier.size() > 0:
		var i = rng.int_range(0, frontier.size() - 1)
		var pair: Array = frontier[i]
		frontier.remove_at(i)
		var gb: int = find.call(pair[1])
		if visited.has(gb):
			continue
		visited[gb] = true
		links.append(pair)
		push_frontier.call(gb)

	var degree = {}
	for l in links:
		var ga: int = find.call(l[0])
		var gb2: int = find.call(l[1])
		degree[ga] = degree.get(ga, 0) + 1
		degree[gb2] = degree.get(gb2, 0) + 1
	var sizes2: Dictionary = group_size.call()
	var sx0 = start_cell % cxn
	var sy0 = start_cell / cxn
	var leaves = []
	for g in degree.keys():
		if degree[g] == 1 and g != find.call(start_cell) and sizes2.get(g, 0) == 1:
			leaves.append(g)
	# tri stable décroissant par distance au départ (comme Array.sort en JS)
	leaves = _stable_sort(leaves, func(g1, g2):
		return (absi(g2 % cxn - sx0) + absi(g2 / cxn - sy0)) - (absi(g1 % cxn - sx0) + absi(g1 / cxn - sy0)))
	var secret_group: int = leaves[0] if leaves.size() > 0 else -1

	# 6. liens supplémentaires
	var link_key = func(a: int, b: int) -> String:
		var fa: int = find.call(a)
		var fb: int = find.call(b)
		return "%d-%d" % [fa, fb] if fa < fb else "%d-%d" % [fb, fa]
	var linked = {}
	for l in links:
		linked[link_key.call(l[0], l[1])] = true
	var extra = []
	for c in cxn * cyn:
		for n in neighbors.call(c):
			if n < c or find.call(n) == find.call(c):
				continue
			if find.call(c) == secret_group or find.call(n) == secret_group:
				continue
			if linked.has(link_key.call(c, n)):
				continue
			if rng.chance(float(lay.extraLinks)):
				extra.append([c, n])
				linked[link_key.call(c, n)] = true

	var doors = []
	for l in links + extra:
		var mode: String
		if find.call(l[0]) == secret_group or find.call(l[1]) == secret_group:
			mode = "crack"
		elif rng.chance(float(lay.doorChance)):
			mode = "door"
		else:
			mode = "wide" if rng.chance(float(lay.wideChance)) else "gap"
		var placed = open_wall.call(l[0], l[1], mode)
		if mode == "door" and placed != null and placed.size() > 0:
			for p in placed:
				doors.append(grid.idx(p[0], p[1]))
	for i in doors:
		grid.door_open[i] = 1 if rng.chance(0.6) else 0

	# 7. salles
	var rooms_by_group = {}
	for c in cxn * cyn:
		var g: int = find.call(c)
		if not rooms_by_group.has(g):
			rooms_by_group[g] = {"id": rooms_by_group.size(), "cells": [], "group": g}
		rooms_by_group[g].cells.append(c)
	var rooms: Array = rooms_by_group.values()
	for r in rooms:
		var min_x = 1 << 30
		var min_y = 1 << 30
		var max_x = -(1 << 30)
		var max_y = -(1 << 30)
		for c in r.cells:
			var cx: int = c % cxn
			var cy: int = c / cxn
			min_x = mini(min_x, cx * cs + 1)
			min_y = mini(min_y, cy * cs + 1)
			max_x = maxi(max_x, cx * cs + cs - 1)
			max_y = maxi(max_y, cy * cs + cs - 1)
		r.x = min_x
		r.y = min_y
		r.w = max_x - min_x
		r.h = max_y - min_y
		r.cx = r.x + r.w / 2.0
		r.cy = r.y + r.h / 2.0
		var corr = true
		for c in r.cells:
			if not _has_num(corridor_rows, c / cxn):
				corr = false
		r.isCorridor = corr
		r.secret = r.group == secret_group
		r.start = r.group == find.call(start_cell)

	# 8. fourgon
	var scx = start_cell % cxn
	var scy = start_cell / cxn
	var van = {"x": scx * cs + 2, "y": scy * cs + cs - 4, "w": mini(5, cs - 3), "h": 3}
	var lever = {"x": van.x + van.w - 0.5, "y": van.y + 0.5}
	var spawn = {"x": van.x + van.w / 2.0, "y": van.y - 1.2}
	var reserved = {}
	for y in range(van.y - 2, van.y + van.h + 1):
		for x in range(van.x - 1, van.x + van.w + 1):
			reserved[grid.idx(x, y)] = true
	for y in map_h:
		for x in map_w:
			var t = grid.get_t(x, y)
			if t == Grid.DOOR or t == Grid.CRACKED or (t == Grid.FLOOR and _is_opening(grid, x, y)):
				for dy in range(-1, 2):
					for dx in range(-1, 2):
						reserved[grid.idx(x + dx, y + dy)] = true

	# 9. danger des salles
	var dist = Pathfinding.flood(grid, int(floor(spawn.x)), int(floor(spawn.y)), func(x, y):
		var t2 = grid.get_t(x, y)
		return t2 == Grid.DOOR or t2 == Grid.CRACKED or not grid.blocks_move(x, y))
	var max_d = 1
	for r in rooms:
		var d: int = dist[grid.idx(int(floor(r.cx)), int(floor(r.cy)))]
		r.distance = 999 if d < 0 else d
		if d > max_d and not r.secret:
			max_d = d
	for r in rooms:
		r.danger = 0.0 if r.start else minf(1.0, float(r.distance) / max_d)

	# 10. meubles, avec vérification de connectivité
	var props: Dictionary = theme.props
	var reach_count = func() -> int:
		var dd = Pathfinding.flood(grid, int(floor(spawn.x)), int(floor(spawn.y)))
		var n = 0
		for v in dd:
			if v >= 0:
				n += 1
		return n
	var state = {"base": reach_count.call()}
	var try_place = func(cells_to_set: Array, tile: int) -> bool:
		for c in cells_to_set:
			if grid.get_t(c[0], c[1]) != Grid.FLOOR or reserved.has(grid.idx(c[0], c[1])):
				return false
		for c in cells_to_set:
			grid.set_t(c[0], c[1], tile)
		var n: int = reach_count.call()
		if n != state.base - cells_to_set.size():
			for c in cells_to_set:
				grid.set_t(c[0], c[1], Grid.FLOOR)
			return false
		state.base = n
		return true

	for r in rooms:
		if r.start:
			continue
		var area: int = r.w * r.h
		if not r.isCorridor and rng.chance(float(props.shelfRows)) and r.w >= 6:
			var vertical: bool = false if r.h > r.w else rng.chance(0.5)
			var span: int = r.w if vertical else r.h
			var k = 2
			while k < span - 2:
				var length: int = (r.h if vertical else r.w) - 4
				var run = []
				var off = rng.int_range(1, 2)
				for s in range(off, off + length):
					if rng.chance(0.12):
						continue
					run.append([r.x + k, r.y + s] if vertical else [r.x + s, r.y + k])
				var s2 = 0
				while s2 < run.size():
					try_place.call(run.slice(s2, s2 + 3), Grid.SHELF)
					s2 += 3
				k += 3
		var n_tables = int(floor(area / 18.0 * float(props.tables)))
		for _i in n_tables:
			var x = rng.int_range(r.x + 1, r.x + r.w - 2)
			var y = rng.int_range(r.y + 1, r.y + r.h - 2)
			var horiz = rng.chance(0.5)
			try_place.call([[x, y], [x + 1, y]] if horiz else [[x, y], [x, y + 1]], Grid.TABLE)
		if rng.chance(float(props.debris)):
			var px = rng.int_range(r.x, r.x + r.w - 3)
			var py = rng.int_range(r.y, r.y + r.h - 3)
			# NB : comme en JS, la borne est retirée au sort à chaque test de boucle
			var yy = py
			while yy < py + rng.int_range(2, 4):
				var xx = px
				while xx < px + rng.int_range(2, 4):
					if grid.get_t(xx, yy) == Grid.FLOOR and not reserved.has(grid.idx(xx, yy)):
						grid.set_t(xx, yy, Grid.DEBRIS)
					xx += 1
				yy += 1
		if rng.chance(float(props.grates)):
			var px2 = rng.int_range(r.x, r.x + r.w - 2)
			var py2 = rng.int_range(r.y, r.y + r.h - 2)
			for yy2 in range(py2, py2 + 2):
				var xx2 = px2
				while xx2 < px2 + rng.int_range(2, 5):
					if grid.get_t(xx2, yy2) == Grid.FLOOR:
						grid.set_t(xx2, yy2, Grid.GRATE)
					xx2 += 1

	var reach = Pathfinding.flood(grid, int(floor(spawn.x)), int(floor(spawn.y)))
	var accessible = func(x: int, y: int) -> bool:
		return reach[grid.idx(x, y)] >= 0

	# 11. casiers
	var lockers = []
	for r in rooms:
		if r.start or r.secret:
			continue
		var n: int = (2 if r.cells.size() > 1 else 1) if rng.chance(float(props.lockers)) else 0
		for _k in n:
			for _tries in 20:
				var x = rng.int_range(r.x, r.x + r.w - 1)
				var y = rng.int_range(r.y, r.y + r.h - 1)
				if grid.get_t(x, y) != Grid.FLOOR or reserved.has(grid.idx(x, y)) or not accessible.call(x, y):
					continue
				var wall_dir = null
				for wd in [[0, -1], [0, 1], [-1, 0], [1, 0]]:
					if grid.get_t(x + wd[0], y + wd[1]) == Grid.WALL:
						wall_dir = wd
						break
				if wall_dir == null:
					continue
				var too_close = false
				for l in lockers:
					if absf(l.x - x - 0.5) + absf(l.y - y - 0.5) < 3:
						too_close = true
				if too_close:
					continue
				lockers.append({"id": lockers.size() + 1, "x": x + 0.5, "y": y + 0.5, "face": atan2(-wall_dir[1], -wall_dir[0]), "room": r.id})
				reserved[grid.idx(x, y)] = true
				break

	# 12. monte-charges
	var elevators = []
	var far_rooms = []
	for r in rooms:
		if not r.start and not r.secret and not r.isCorridor:
			far_rooms.append(r)
	far_rooms = _stable_sort(far_rooms, func(a, b): return a.danger - b.danger)
	if far_rooms.size() >= 4:
		for r in [far_rooms[int(floor(far_rooms.size() * 0.25))], far_rooms[far_rooms.size() - 1]]:
			var spot: Array = find_free_spot(grid, r, rng, reserved, 60, accessible)
			if not spot.is_empty():
				elevators.append({"id": elevators.size(), "x": spot[0] + 0.5, "y": spot[1] + 0.5, "room": r.id})
				reserved[grid.idx(spot[0], spot[1])] = true
		if elevators.size() == 2:
			elevators[0].pair = 1
			elevators[1].pair = 0
		else:
			elevators.clear()

	# 13. lampes
	var lamps = []
	for r in rooms:
		if r.secret:
			continue
		if r.start or rng.chance(float(props.lamps)):
			for c in r.cells:
				if not r.start and rng.chance(0.4):
					continue
				var lx = (c % cxn) * cs + cs / 2.0 + 0.5
				var ly = (c / cxn) * cs + cs / 2.0 + 0.5
				var radius: float = 6.0 if r.start else rng.range_f(3.5, 5.5)
				var flicker = 0.0
				if not r.start:
					flicker = rng.range_f(0.3, 1.0) if rng.chance(0.35) else 0.0
				lamps.append({"x": lx, "y": ly, "radius": radius, "flicker": flicker, "start": r.start, "on": true})

	# 14. butin
	var items = _place_loot(grid, rooms, theme, rng, loot_mul, accessible)
	for r in rooms:
		if r.secret:
			var s3: Array = find_free_spot(grid, r, rng, reserved)
			if not s3.is_empty():
				items.append({"type": "golden_gnome", "x": s3[0] + 0.5, "y": s3[1] + 0.5, "secret": true})
			for _i in 2:
				var s4: Array = find_free_spot(grid, r, rng, reserved)
				if not s4.is_empty():
					items.append({"type": rng.pick(["safe", "painting", "trophy"]), "x": s4[0] + 0.5, "y": s4[1] + 0.5, "secret": true})
			break

	return {
		"theme": theme_id, "seed": seed_value, "w": map_w, "h": map_h, "grid": grid, "rooms": rooms, "van": van, "lever": lever,
		"spawn": spawn, "lockers": lockers, "elevators": elevators, "lamps": lamps, "items": items, "doors": doors, "cellSize": cs,
	}


static func find_free_spot(grid: Grid, room: Dictionary, rng: Rng, reserved, tries := 40, filter := Callable()) -> Array:
	for _i in tries:
		var x = rng.int_range(room.x, room.x + room.w - 1)
		var y = rng.int_range(room.y, room.y + room.h - 1)
		var t = grid.get_t(x, y)
		if (t == Grid.FLOOR or t == Grid.DEBRIS or t == Grid.GRATE) and (reserved == null or not reserved.has(grid.idx(x, y))) and (not filter.is_valid() or filter.call(x, y)):
			return [x, y]
	return []


static func _place_loot(grid: Grid, rooms: Array, theme: Dictionary, rng: Rng, mul: float, accessible: Callable) -> Array:
	var items_db: Dictionary = Data.db.ITEMS
	var types = []
	var weights = []
	for t in theme.loot.keys():
		if items_db.has(t):
			types.append(t)
			weights.append(theme.loot[t])
	var out = []
	var count = int(round(float(theme.lootCount) * mul))
	var candidates = []
	for r in rooms:
		if not r.start and not r.secret:
			candidates.append(r)
	for _i in count:
		var type: String = rng.weighted(types, weights)
		var vr: Array = items_db[type].value
		var value = (float(vr[0]) + float(vr[1])) / 2.0
		var rw = []
		for r in candidates:
			if r.danger < 0.3 and value > 90:
				rw.append(0.0)
			else:
				rw.append(0.15 + r.danger * (3.0 if value > 150 else 1.2) + (-0.1 if r.isCorridor else 0.0))
		var room = rng.weighted(candidates, rw)
		if room == null:
			room = rng.pick(candidates)
		var spot: Array = find_free_spot(grid, room, rng, null, 40, accessible)
		if spot.is_empty():
			continue
		out.append({"type": type, "x": spot[0] + rng.range_f(0.3, 0.7), "y": spot[1] + rng.range_f(0.3, 0.7)})
	return out


static func _is_opening(grid: Grid, x: int, y: int) -> bool:
	var walls_h = grid.get_t(x - 1, y) == Grid.WALL and grid.get_t(x + 1, y) == Grid.WALL
	var walls_v = grid.get_t(x, y - 1) == Grid.WALL and grid.get_t(x, y + 1) == Grid.WALL
	return walls_h or walls_v


static func _has_num(arr: Array, v: int) -> bool:
	for a in arr:
		if int(a) == v:
			return true
	return false


# Tri stable (insertion) : cmp(a, b) < 0 si a avant b — comme Array.prototype.sort en JS.
static func _stable_sort(arr: Array, cmp: Callable) -> Array:
	var out = arr.duplicate()
	for i in range(1, out.size()):
		var cur = out[i]
		var j = i - 1
		while j >= 0 and float(cmp.call(out[j], cur)) > 0.0:
			out[j + 1] = out[j]
			j -= 1
		out[j + 1] = cur
	return out


# Index case → salle (les jointures entre cellules fusionnées appartiennent à la salle).
static func build_room_grid(m: Dictionary) -> PackedInt32Array:
	var cs: int = m.cellSize
	var cxn: int = (m.w - 1) / cs
	var g = PackedInt32Array()
	g.resize(m.w * m.h)
	g.fill(-1)
	for ri in m.rooms.size():
		var r: Dictionary = m.rooms[ri]
		var cellset = {}
		for c in r.cells:
			cellset[c] = true
		for c in r.cells:
			var cx: int = c % cxn
			var cy: int = c / cxn
			var x1: int = cx * cs + cs - 1 + (1 if cellset.has(c + 1) and cx + 1 < cxn else 0)
			var y1: int = cy * cs + cs - 1 + (1 if cellset.has(c + cxn) else 0)
			for y in range(cy * cs + 1, y1 + 1):
				for x in range(cx * cs + 1, x1 + 1):
					g[y * m.w + x] = ri
	return g


# Carte reçue du serveur (serializeMap de shared/map/generator.js) → même structure que generate().
static func deserialize(s: Dictionary) -> Dictionary:
	var w = int(s.w)
	var h = int(s.h)
	var grid = Grid.new(w, h)
	var tiles = String(s.tiles)
	for i in mini(tiles.length(), w * h):
		grid.tiles[i] = tiles.unicode_at(i) - 48
	var doors = []
	for d in s.doors:
		doors.append(int(d))
	var dopen = String(s.get("doorOpen", ""))
	for k in doors.size():
		if k < dopen.length():
			grid.door_open[doors[k]] = dopen.unicode_at(k) - 48
	var rooms = []
	for r in s.rooms:
		rooms.append({"id": int(r.id), "x": int(r.x), "y": int(r.y), "w": int(r.w), "h": int(r.h), "danger": float(r.danger), "secret": bool(r.secret),
			"start": bool(r.start), "isCorridor": bool(r.get("corridor", false)), "cells": r.get("cells", [])})
	var lockers = []
	for l in s.lockers:
		lockers.append({"id": int(l.id), "x": float(l.x), "y": float(l.y), "face": float(l.face), "room": l.get("room", -1)})
	var lamps = []
	for l in s.lamps:
		var lc = l.duplicate()
		lc.on = bool(l.get("on", true))
		lamps.append(lc)
	return {
		"theme": String(s.theme), "seed": int(s.seed), "w": w, "h": h, "grid": grid, "rooms": rooms, "van": s.van, "lever": s.lever, "spawn": s.spawn,
		"lockers": lockers, "elevators": s.elevators, "lamps": lamps, "items": [], "doors": doors, "cellSize": int(s.get("cellSize", 9)),
	}
