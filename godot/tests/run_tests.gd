# Tests automatiques (lancés en CI : godot --headless --path godot res://tests/test_runner.tscn).
# Code de sortie 0 = tout réussi, 1 = au moins un échec.
extends Node

var passed = 0
var failed = 0
var _keep = []  # les Callable ne retiennent pas les RefCounted : on garde les instances


func _ready() -> void:
	print("=== Tests Opération Panique 3D ===")
	test_data()
	test_rng_parity()
	test_map_parity()
	test_maps_navigable()
	test_pathfinding()
	test_grid_sight_sound()
	test_scripts_compile()
	for t in extra_tests():
		t.call()
	print("=== %d réussis, %d échoués ===" % [passed, failed])
	get_tree().quit(1 if failed > 0 else 0)


# Point d'extension : tests de la simulation (ajoutés par d'autres fichiers)
func extra_tests() -> Array:
	var out = []
	if not ResourceLoader.exists("res://tests/sim_tests.gd"):
		return out
	var sim_tests = load("res://tests/sim_tests.gd")
	if sim_tests:
		var inst = sim_tests.new(self)
		_keep.append(inst)
		for m in inst.get_method_list():
			if String(m.name).begins_with("test_"):
				out.append(Callable(inst, m.name))
	return out


func check(name: String, ok: bool, detail := "") -> void:
	if ok:
		passed += 1
		print("  ✔ ", name)
	else:
		failed += 1
		print("  ✖ ", name, "  ", detail)


func fixtures() -> Dictionary:
	var f = FileAccess.open("res://tests/fixtures.json", FileAccess.READ)
	return JSON.parse_string(f.get_as_text())


func test_data() -> void:
	check("données chargées (8 créatures, 27 événements)", Data.db.MONSTERS.size() == 8 and Data.db.EVENTS.size() == 27, str(Data.db.keys()))


func test_rng_parity() -> void:
	var fx = fixtures()
	var r = Rng.new(int(fx.rng.seed))
	var ok = true
	for v in fx.rng.values:
		var mine = r.next()
		if absf(mine - float(v)) > 1e-12:
			ok = false
	check("générateur aléatoire identique à la version web", ok)
	check("hachage identique à la version web", Rng.hash_string("Opération Panique") == int(fx.rng.hash), "%d vs %d" % [Rng.hash_string("Opération Panique"), int(fx.rng.hash)])


func test_map_parity() -> void:
	var fx = fixtures()
	for ref in fx.maps:
		var m = MapGen.generate(ref.theme, int(ref.seed))
		var tiles = ""
		var g: Grid = m.grid
		for t in g.tiles:
			tiles += str(t)
		var same_tiles: bool = tiles == ref.tiles
		var same_counts: bool = m.items.size() == int(ref.items) and m.lockers.size() == int(ref.lockers) and m.elevators.size() == int(ref.elevators)
		var detail = ""
		if not same_tiles:
			for i in mini(tiles.length(), ref.tiles.length()):
				if tiles[i] != ref.tiles[i]:
					detail = "1re différence à la case %d (x=%d, y=%d)" % [i, i % int(ref.w), i / int(ref.w)]
					break
		check("carte %s#%d identique au serveur" % [ref.theme, int(ref.seed)], same_tiles and same_counts, detail + " objets %d/%d casiers %d/%d" % [m.items.size(), int(ref.items), m.lockers.size(), int(ref.lockers)])


func test_maps_navigable() -> void:
	var ok = true
	for theme in ["warehouse", "hotel", "lab"]:
		for s in range(1, 9):
			var m = MapGen.generate(theme, s * 7919)
			var g: Grid = m.grid
			var d = Pathfinding.flood(g, int(floor(m.spawn.x)), int(floor(m.spawn.y)))
			for it in m.items:
				if it.get("secret", false):
					continue
				if d[g.idx(int(floor(it.x)), int(floor(it.y)))] < 0:
					ok = false
	check("24 cartes : tout le butin accessible", ok)


func test_pathfinding() -> void:
	var m = MapGen.generate("lab", 77)
	var g: Grid = m.grid
	var p = Pathfinding.find_path(g, m.spawn.x, m.spawn.y, m.items[0].x, m.items[0].y)
	check("A* trouve un chemin vers un objet", p.size() > 0)


func test_grid_sight_sound() -> void:
	var g = Grid.new(10, 3)
	for x in 10:
		g.set_t(x, 1, Grid.FLOOR)
	var open_los = g.has_los(0.5, 1.5, 9.5, 1.5)
	g.set_t(5, 1, Grid.WALL)
	check("la vue est bloquée par un mur", open_los and not g.has_los(0.5, 1.5, 9.5, 1.5))
	check("le son est étouffé par un mur", g.sound_obstruction(0.5, 1.5, 9.5, 1.5) > 2.0)


# Chaque script du jeu doit se compiler (y compris ceux que les tests n'utilisent pas encore).
func test_scripts_compile() -> void:
	var bad = []
	var n = 0
	for path in list_files("res://scripts", ".gd"):
		n += 1
		var sc = load(path)
		if sc == null or not sc.can_instantiate():
			bad.append(path)
	check("%d scripts compilés sans erreur" % n, bad.is_empty(), str(bad))


func list_files(dir: String, ext: String) -> Array:
	var out = []
	var d = DirAccess.open(dir)
	if d == null:
		return out
	for f in d.get_files():
		if f.ends_with(ext):
			out.append(dir + "/" + f)
	for sub in d.get_directories():
		out.append_array(list_files(dir + "/" + sub, ext))
	return out
