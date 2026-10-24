# Construit le niveau 3D à partir de la carte de la simulation (même grille que la
# version 2D) : sols, murs, plafonds, étagères, tables, débris, grilles, portes animées,
# casiers, monte-charges, fourgon, levier, lampes. Les murs sont regroupés en MultiMesh
# (quelques appels de dessin seulement, indispensable sur téléphone).
class_name WorldBuilder
extends Node3D

const T = 1.4          # taille d'une case (m)
const H = 3.0          # hauteur sous plafond (m)
const DOOR_H = 2.3

var map: Dictionary
var grid: Grid
var theme_id = "warehouse"
var mats: Dictionary
var doors = {}          # index de case -> {pivot, panel, open, broken, angle}
var lamp_nodes = []     # {light, fixture, data, phase}
var cracked = {}        # index de case -> numéro d'instance dans cracked_mm
var cracked_mm: MultiMeshInstance3D
var lever_light: OmniLight3D
var lever_bulb: MeshInstance3D
var lamp_color = Color(1.0, 0.72, 0.42)
var rng = RandomNumberGenerator.new()


static func to3(x: float, y: float, h := 0.0) -> Vector3:
	return Vector3(x * T, h, y * T)


# Rotation Y pour qu'un modèle construit « face à +X » regarde dans la direction a (angle 2D).
static func yaw(a: float) -> float:
	return -a


func build(m: Dictionary) -> void:
	map = m
	grid = m.grid
	theme_id = m.theme
	rng.seed = int(m.seed)
	var pal = Data.db.THEMES[theme_id].palette
	mats = Mats.theme_set(theme_id, pal)
	match theme_id:
		"hotel":
			lamp_color = Color(1.0, 0.78, 0.5)
		"lab":
			lamp_color = Color(0.75, 0.92, 1.0)
	_build_floor_ceiling()
	_build_walls()
	_build_furniture()
	_build_doors()
	_build_lockers()
	_build_elevators()
	_build_van()
	_build_lever()
	_build_lamps()


func _mm(mesh: Mesh, mat: Material, transforms: Array, shadows := true) -> MultiMeshInstance3D:
	var mm = MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.mesh = mesh
	mm.instance_count = transforms.size()
	for i in transforms.size():
		mm.set_instance_transform(i, transforms[i])
	var inst = MultiMeshInstance3D.new()
	inst.multimesh = mm
	inst.material_override = mat
	inst.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if shadows else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(inst)
	return inst


func _box(size: Vector3, mat: Material, pos: Vector3, parent: Node = null, rot_y := 0.0) -> MeshInstance3D:
	var mi = MeshInstance3D.new()
	var b = BoxMesh.new()
	b.size = size
	mi.mesh = b
	mi.material_override = mat
	mi.position = pos
	mi.rotation.y = rot_y
	(parent if parent != null else self).add_child(mi)
	return mi


func _is_wallish(x: int, y: int) -> bool:
	var t = grid.get_t(x, y)
	return t == Grid.WALL or t == Grid.CRACKED


func _build_floor_ceiling() -> void:
	var w = map.w * T
	var h = map.h * T
	var fl = PlaneMesh.new()
	fl.size = Vector2(w, h)
	var f = MeshInstance3D.new()
	f.mesh = fl
	f.material_override = mats.floor
	f.position = Vector3(w / 2, 0, h / 2)
	f.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(f)
	var c = MeshInstance3D.new()
	c.mesh = fl
	c.material_override = mats.ceiling
	c.position = Vector3(w / 2, H, h / 2)
	c.rotation.x = PI
	c.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(c)


func _build_walls() -> void:
	var walls = []
	var cr = []
	for y in map.h:
		for x in map.w:
			var t = grid.get_t(x, y)
			if t != Grid.WALL and t != Grid.CRACKED:
				continue
			# inutile de dessiner un mur entièrement entouré d'autres murs
			var visible = false
			for d in [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]:
				var nx = x + d[0]
				var ny = y + d[1]
				if grid.in_bounds(nx, ny) and not _is_wallish(nx, ny):
					visible = true
					break
			if not visible:
				continue
			var tr = Transform3D(Basis(), to3(x + 0.5, y + 0.5, H / 2))
			if t == Grid.CRACKED:
				cracked[grid.idx(x, y)] = cr.size()
				cr.append(tr)
			else:
				walls.append(tr)
	var box = BoxMesh.new()
	box.size = Vector3(T, H, T)
	_mm(box, mats.wall, walls)
	if cr.size() > 0:
		cracked_mm = _mm(box, mats.cracked, cr)
	# plinthes sombres le long des murs (cache la jonction mur/sol)
	var skirt = []
	for y in map.h:
		for x in map.w:
			if _is_wallish(x, y) or grid.get_t(x, y) == Grid.DOOR:
				continue
			for d in [[1, 0], [-1, 0], [0, 1], [0, -1]]:
				if _is_wallish(x + d[0], y + d[1]):
					var pos = to3(x + 0.5 + d[0] * 0.48, y + 0.5 + d[1] * 0.48, 0.06)
					var b = Basis(Vector3.UP, PI / 2) if d[0] != 0 else Basis()
					skirt.append(Transform3D(b, pos))
	var sk = BoxMesh.new()
	sk.size = Vector3(T, 0.12, 0.04)
	_mm(sk, mats.door, skirt, false)


# Une case a disparu (mur fissuré défoncé) : on retire son instance.
func remove_cracked(i: int) -> void:
	if cracked_mm == null or not cracked.has(i):
		return
	cracked_mm.multimesh.set_instance_transform(cracked[i], Transform3D(Basis().scaled(Vector3(0.001, 0.001, 0.001)), Vector3(0, -50, 0)))
	cracked.erase(i)
	# gravats au sol
	var x = i % grid.w
	var y = i / grid.w
	for k in 8:
		var b = _box(Vector3(rng.randf_range(0.15, 0.45), rng.randf_range(0.08, 0.25), rng.randf_range(0.15, 0.4)), mats.cracked,
			to3(x + rng.randf(), y + rng.randf(), 0.08))
		b.rotation = Vector3(rng.randf() * 0.6, rng.randf() * TAU, rng.randf() * 0.6)


func _build_furniture() -> void:
	var shelf_boards = []
	var shelf_posts = []
	var boxes = []
	var table_tops = []
	var table_legs = []
	var shards = []
	var grates = []
	for y in map.h:
		for x in map.w:
			var t = grid.get_t(x, y)
			var c = to3(x + 0.5, y + 0.5)
			match t:
				Grid.SHELF:
					# étagère métallique 4 niveaux, chargée de cartons
					var along_x = grid.get_t(x - 1, y) == Grid.SHELF or grid.get_t(x + 1, y) == Grid.SHELF
					var b = Basis() if along_x else Basis(Vector3.UP, PI / 2)
					for lv in 4:
						shelf_boards.append(Transform3D(b, c + Vector3(0, 0.15 + lv * 0.62, 0)))
						if rng.randf() < 0.75:
							var n = rng.randi_range(1, 3)
							for k in n:
								var s = Vector3(rng.randf_range(0.3, 0.55), rng.randf_range(0.22, 0.45), rng.randf_range(0.3, 0.5))
								var off = b * Vector3((k - (n - 1) / 2.0) * 0.45 + rng.randf_range(-0.05, 0.05), 0.18 + lv * 0.62 + s.y / 2, rng.randf_range(-0.08, 0.08))
								boxes.append(Transform3D(Basis(Vector3.UP, rng.randf_range(-0.2, 0.2)).scaled(s), c + off))
					for px in [-0.62, 0.62]:
						for pz in [-0.3, 0.3]:
							shelf_posts.append(Transform3D(b, c + b * Vector3(px, 1.05, pz)))
				Grid.TABLE:
					table_tops.append(Transform3D(Basis(Vector3.UP, rng.randf_range(-0.05, 0.05)), c + Vector3(0, 0.78, 0)))
					for lx in [-0.55, 0.55]:
						for lz in [-0.5, 0.5]:
							table_legs.append(Transform3D(Basis(), c + Vector3(lx, 0.38, lz)))
				Grid.DEBRIS:
					for k in 9:
						var s = Vector3(rng.randf_range(0.05, 0.22), rng.randf_range(0.01, 0.05), rng.randf_range(0.05, 0.18))
						var bb = Basis(Vector3.UP, rng.randf() * TAU).rotated(Vector3.RIGHT, rng.randf_range(-0.3, 0.3)).scaled(s)
						shards.append(Transform3D(bb, c + Vector3(rng.randf_range(-0.6, 0.6), 0.015, rng.randf_range(-0.6, 0.6))))
				Grid.GRATE:
					grates.append(Transform3D(Basis(), c + Vector3(0, 0.012, 0)))
	var board = BoxMesh.new()
	board.size = Vector3(T * 0.95, 0.05, 0.7)
	if shelf_boards.size() > 0:
		_mm(board, mats.shelf, shelf_boards)
		var post = BoxMesh.new()
		post.size = Vector3(0.06, 2.1, 0.06)
		_mm(post, mats.shelf, shelf_posts)
	if boxes.size() > 0:
		var cb = BoxMesh.new()
		cb.size = Vector3.ONE
		var carton = Mats.surface("carton", {"color_a": Color(0.55, 0.42, 0.27), "color_b": Color(0.32, 0.23, 0.14), "grime_color": Color(0.1, 0.07, 0.04),
			"pattern": 0, "scale": 1.2, "roughness_min": 0.75, "roughness_max": 1.0, "bump": 0.5, "stains": 0.9, "grime_height": 0.0})
		_mm(cb, carton, boxes)
	if table_tops.size() > 0:
		var top = BoxMesh.new()
		top.size = Vector3(T * 0.98, 0.07, T * 0.92)
		_mm(top, mats.table, table_tops)
		var leg = BoxMesh.new()
		leg.size = Vector3(0.07, 0.76, 0.07)
		_mm(leg, mats.table, table_legs)
	if shards.size() > 0:
		var sh = BoxMesh.new()
		sh.size = Vector3.ONE
		_mm(sh, mats.debris, shards, false)
	if grates.size() > 0:
		var gp = BoxMesh.new()
		gp.size = Vector3(T, 0.02, T)
		_mm(gp, mats.grate, grates, false)


func _build_doors() -> void:
	for i in map.doors:
		var x = i % grid.w
		var y = i / grid.w
		# porte dans un mur horizontal (murs à gauche/droite) ou vertical
		var along_x = _is_wallish(x - 1, y) or _is_wallish(x + 1, y)
		var pivot = Node3D.new()
		var hinge = to3(x, y + 0.5) if along_x else to3(x + 0.5, y)
		pivot.position = hinge
		pivot.rotation.y = 0.0 if along_x else -PI / 2
		add_child(pivot)
		var panel = _box(Vector3(T * 0.96, DOOR_H, 0.07), mats.door, Vector3(T * 0.5, DOOR_H / 2, 0), pivot)
		# poignée
		_box(Vector3(0.12, 0.04, 0.16), mats.metal, Vector3(T * 0.85, 1.05, 0), pivot)
		# linteau au-dessus de la porte
		var lintel_pos = to3(x + 0.5, y + 0.5, (H + DOOR_H) / 2)
		_box(Vector3(T, H - DOOR_H, T), mats.wall, lintel_pos)
		doors[i] = {"pivot": pivot, "panel": panel, "open": 0.0, "target": 0.0, "broken": false, "dir": 1.0 if rng.randf() < 0.5 else -1.0}


# chaîne d'état des portes de l'instantané : "0" fermée, "1" ouverte, "2" défoncée
func update_doors(states: String, dt: float) -> void:
	var k = 0
	for i in map.doors:
		if k >= states.length():
			break
		var d = doors[i]
		var s = states[k]
		k += 1
		if s == "2" and not d.broken:
			d.broken = true
			var p: Node3D = d.pivot
			p.rotation.z = 0.0
			d.panel.position = Vector3(T * 0.5, 0.05, 0.6 * d.dir)
			d.panel.rotation = Vector3(PI / 2, 0, rng.randf_range(-0.2, 0.2))
			continue
		if d.broken:
			continue
		d.target = 1.0 if s == "1" else 0.0
		d.open = move_toward(d.open, d.target, dt * 2.8)
		d.panel.rotation.y = d.open * 1.75 * d.dir


func _build_lockers() -> void:
	var body = BoxMesh.new()
	body.size = Vector3(0.6, 2.05, T * 0.62)
	var vent = BoxMesh.new()
	vent.size = Vector3(0.02, 0.03, T * 0.4)
	for l in map.lockers:
		var n = Node3D.new()
		n.position = to3(l.x, l.y)
		n.rotation.y = yaw(l.face)
		add_child(n)
		var b = MeshInstance3D.new()
		b.mesh = body
		b.material_override = mats.metal
		b.position = Vector3(0, 1.025, 0)
		n.add_child(b)
		for k in 5:
			var v = MeshInstance3D.new()
			v.mesh = vent
			v.material_override = Mats.std("black", Color(0.02, 0.02, 0.02), 0.9)
			v.position = Vector3(0.305, 1.75 - k * 0.06, 0)
			n.add_child(v)
		_box(Vector3(0.04, 0.18, 0.04), Mats.std("chrome", Color(0.7, 0.7, 0.72), 0.2, 1.0), Vector3(0.32, 1.05, T * 0.22), n)


func _build_elevators() -> void:
	var cage = Mats.std("cage", Color(0.25, 0.27, 0.28), 0.45, 0.85)
	for e in map.elevators:
		var n = Node3D.new()
		n.position = to3(e.x, e.y)
		add_child(n)
		_box(Vector3(T * 0.95, 0.06, T * 0.95), mats.grate, Vector3(0, 0.03, 0), n)
		for cx in [-1, 1]:
			for cz in [-1, 1]:
				_box(Vector3(0.06, H, 0.06), cage, Vector3(cx * T * 0.46, H / 2, cz * T * 0.46), n)
		for k in 6:
			_box(Vector3(T * 0.92, 0.03, 0.03), cage, Vector3(0, 0.4 + k * 0.4, T * 0.46), n)
			_box(Vector3(T * 0.92, 0.03, 0.03), cage, Vector3(0, 0.4 + k * 0.4, -T * 0.46), n)
		_box(Vector3(0.1, 0.18, 0.05), Mats.glow("elev_btn", Color(1.0, 0.55, 0.1), 2.5), Vector3(T * 0.46, 1.2, 0), n)
		var light = OmniLight3D.new()
		light.light_color = Color(1.0, 0.6, 0.25)
		light.light_energy = 0.4
		light.omni_range = 2.2
		light.position = Vector3(0, 2.4, 0)
		n.add_child(light)


func _build_van() -> void:
	var v = map.van
	var n = Node3D.new()
	add_child(n)
	var x0 = float(v.x)
	var y0 = float(v.y)
	var w = float(v.w)
	var h = float(v.h)
	var paint = Mats.surface("van_paint", {"color_a": Color(0.82, 0.8, 0.74), "color_b": Color(0.55, 0.53, 0.48), "grime_color": Color(0.12, 0.1, 0.07),
		"pattern": 3, "scale": 0.6, "roughness_min": 0.25, "roughness_max": 0.6, "metal": 0.3, "bump": 0.2, "stains": 0.9, "grime_height": 0.9})
	var bed_h = 0.18
	# plancher du fourgon (zone de dépôt) + bande de sécurité orange
	_box(Vector3(w * T, bed_h, h * T), mats.metal, to3(x0 + w / 2, y0 + h / 2, bed_h / 2), n)
	_box(Vector3(w * T, 0.01, 0.12), Mats.glow("van_stripe", Color(1.0, 0.5, 0.05), 0.8), to3(x0 + w / 2, y0 + h, bed_h + 0.01), n)
	# toit sur montants (la zone reste ouverte : on y entre de tous les côtés)
	_box(Vector3(w * T + 0.1, 0.08, h * T + 0.1), paint, to3(x0 + w / 2, y0 + h / 2, 2.45), n)
	for cx in [x0, x0 + w]:
		for cz in [y0, y0 + h]:
			_box(Vector3(0.1, 2.3, 0.1), paint, to3(cx, cz, 1.3), n)
	# paroi avant + cabine
	_box(Vector3(0.08, 2.3, h * T), paint, to3(x0, y0 + h / 2, 1.3), n)
	_box(Vector3(1.6, 1.7, h * T * 0.9), paint, to3(x0, y0 + h / 2, 0.95) - Vector3(0.85, 0, 0), n)
	_box(Vector3(0.05, 0.55, h * T * 0.8), Mats.std("glass", Color(0.05, 0.07, 0.08), 0.05, 0.6), to3(x0, y0 + h / 2, 1.45) - Vector3(1.66, 0, 0), n)
	# lettrage « Récup'Express » (bandeau accent)
	_box(Vector3(w * T * 0.8, 0.25, 0.02), mats.accent, to3(x0 + w / 2, y0, 1.9) - Vector3(0, 0, 0.06), n)
	# éclairage intérieur rassurant
	var light = OmniLight3D.new()
	light.light_color = Color(1.0, 0.85, 0.6)
	light.light_energy = 1.3
	light.omni_range = 5.5
	light.position = to3(x0 + w / 2, y0 + h / 2, 2.2)
	n.add_child(light)
	_box(Vector3(1.2, 0.04, 0.2), Mats.glow("van_neon", Color(1.0, 0.9, 0.7), 3.0), to3(x0 + w / 2, y0 + h / 2, 2.39), n)
	# phares
	for side in [-1, 1]:
		_box(Vector3(0.05, 0.14, 0.25), Mats.glow("headlight", Color(1.0, 0.95, 0.8), 4.0), to3(x0, y0 + h / 2, 0.55) - Vector3(1.66, 0, side * h * T * 0.32), n)


func _build_lever() -> void:
	var lv = map.lever
	var n = Node3D.new()
	n.position = to3(lv.x, lv.y)
	add_child(n)
	_box(Vector3(0.3, 1.1, 0.3), mats.metal, Vector3(0, 0.55, 0), n)
	var handle = _box(Vector3(0.06, 0.5, 0.06), Mats.std("lever_red", Color(0.7, 0.05, 0.05), 0.4), Vector3(0, 1.3, 0), n)
	handle.rotation.z = 0.5
	lever_bulb = MeshInstance3D.new()
	var s = SphereMesh.new()
	s.radius = 0.07
	s.height = 0.14
	lever_bulb.mesh = s
	lever_bulb.position = Vector3(0, 1.15, 0.16)
	lever_bulb.material_override = Mats.glow("lever_off", Color(1.0, 0.1, 0.05), 3.0)
	n.add_child(lever_bulb)
	lever_light = OmniLight3D.new()
	lever_light.light_color = Color(1.0, 0.15, 0.1)
	lever_light.light_energy = 0.6
	lever_light.omni_range = 2.5
	lever_light.position = Vector3(0, 1.3, 0.3)
	n.add_child(lever_light)


func set_lever_ready(ready: bool) -> void:
	var c = Color(0.1, 1.0, 0.3) if ready else Color(1.0, 0.1, 0.05)
	lever_light.light_color = c
	lever_bulb.material_override = Mats.glow("lever_on" if ready else "lever_off", c, 3.0)


func _build_lamps() -> void:
	for l in map.lamps:
		var n = Node3D.new()
		n.position = to3(l.x, l.y, H - 0.05)
		add_child(n)
		var fixture = MeshInstance3D.new()
		var b = BoxMesh.new()
		b.size = Vector3(0.9, 0.06, 0.22)
		fixture.mesh = b
		fixture.material_override = Mats.glow("lamp_on_" + theme_id, lamp_color, 3.0)
		n.add_child(fixture)
		_box(Vector3(0.02, 0.5, 0.02), mats.metal, Vector3(0.3, 0.25, 0), n)
		var light = OmniLight3D.new()
		light.light_color = lamp_color
		light.light_energy = 1.6
		light.omni_range = float(l.radius) * T * 1.1
		light.omni_attenuation = 1.4
		light.position = Vector3(0, -0.25, 0)
		light.visible = false
		n.add_child(light)
		lamp_nodes.append({"light": light, "fixture": fixture, "data": l, "phase": rng.randf() * 10.0, "on": true, "node": n})


# Allume au plus `budget` lampes proches de la caméra (les autres gardent leur néon émissif).
func update_lamps(states: String, cam_pos: Vector3, t: float, ambient: float, flicker_mod: float, budget := 7) -> void:
	var cands = []
	for i in lamp_nodes.size():
		var ln = lamp_nodes[i]
		var on = i < states.length() and states[i] == "1"
		if on != ln.on:
			ln.on = on
			ln.fixture.material_override = Mats.glow("lamp_on_" + theme_id, lamp_color, 3.0) if on else Mats.std("lamp_off", Color(0.15, 0.15, 0.14), 0.6)
		ln.light.visible = false
		if on and ambient > 0.05:
			cands.append([ln.node.position.distance_squared_to(cam_pos), ln])
	cands.sort_custom(func(a, b): return a[0] < b[0])
	for k in mini(budget, cands.size()):
		var ln = cands[k][1]
		ln.light.visible = true
		var e = 1.6 * ambient
		var fl = float(ln.data.get("flicker", 0.0)) + flicker_mod
		if fl > 0:
			var s = sin(t * 23.0 + ln.phase) * sin(t * 7.3 + ln.phase * 2.0)
			if s > 1.0 - fl * 0.6:
				e *= 0.15
		ln.light.light_energy = e
