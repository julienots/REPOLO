# Captures d'écran automatiques (lancées en CI sous xvfb, rendu OpenGL logiciel) :
# menu, partie en pilote automatique, galerie des 8 créatures, interface mobile.
extends Node

var out_dir = "user://shots"
var only = ""     # --only=crew : seulement la galerie des Récupérateurs (vérification rapide)


func _ready() -> void:
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--out="):
			out_dir = a.substr(6)
		if a.begins_with("--only="):
			only = a.substr(7)
	DirAccess.make_dir_recursive_absolute(out_dir)
	get_tree().create_timer(420.0).timeout.connect(func(): get_tree().quit(2))
	await _run()
	print("CAPTURES TERMINÉES")
	get_tree().quit(0)


func _shot(name: String) -> void:
	await get_tree().process_frame
	await get_tree().process_frame
	await RenderingServer.frame_post_draw
	var img = get_viewport().get_texture().get_image()
	var path = out_dir + "/" + name + ".png"
	img.save_png(path)
	print("capture ", path, " ", img.get_size())


func _wait(sec: float) -> void:
	await get_tree().create_timer(sec).timeout


func _run() -> void:
	Profile3D.load_profile()
	if only == "crew":
		await _crew()
		return
	# 0. intro du studio et écran de chargement
	await _intro()
	if only == "intro":
		return
	# 1. menu
	var main = load("res://scripts/main.gd").new()
	main.skip_intro = true
	add_child(main)
	await _wait(3.0)
	await _shot("01_menu")
	main.menu.show_custom()
	await _wait(1.0)
	await _shot("01_menu_personnalisation")
	main.queue_free()
	await _wait(0.3)
	# 2. galerie des créatures, puis l'équipe de Récupérateurs
	await _gallery()
	await _crew()
	# 3. partie en pilote automatique (entrepôt, hôtel, laboratoire)
	var k = 0
	for mission in ["morvan", "bellevue", "delta7"]:
		var g = Game3D.new()
		g.setup({"mission": mission, "difficulty": "employe", "bots": 3, "seed": 4242 + k, "autopilot": true, "shadows": true, "tts": false, "volume": 0.0})
		add_child(g)
		await _wait(4.0)
		await _shot("%02d_partie_%s_debut" % [3 + k * 2, mission])
		await _wait(14.0)
		await _shot("%02d_partie_%s_suite" % [4 + k * 2, mission])
		g.queue_free()
		await _wait(0.3)
		k += 1
	# 4. face à face avec une créature (placée devant le joueur)
	var n = 0
	for spec in [["morvan", "sourdine"], ["delta7", "demenageur"], ["bellevue", "inspecteur"]]:
		var gc = Game3D.new()
		gc.setup({"mission": spec[0], "difficulty": "employe", "bots": 1, "seed": 777 + n, "tts": false, "volume": 0.0, "shadows": true})
		add_child(gc)
		await _wait(1.5)
		_place_monster(gc, spec[1])
		await _wait(1.2)
		await _shot("%02d_rencontre_%s" % [10 + n, spec[1]])
		gc.queue_free()
		await _wait(0.3)
		n += 1
	# 5. interface tactile
	var gm = Game3D.new()
	gm.setup({"mission": "morvan", "difficulty": "stagiaire", "bots": 2, "seed": 99, "force_mobile": true, "tts": false, "volume": 0.0})
	add_child(gm)
	await _wait(3.0)
	await _shot("20_interface_mobile")
	gm.queue_free()


# Petit « studio » : une salle d'entrepôt éclairée par une lampe torche tenue par la caméra.
func _studio() -> Array:
	var root = Node3D.new()
	add_child(root)
	var mats = Mats.theme_set("warehouse", Data.db.THEMES.warehouse.palette)
	var floor_m = MeshInstance3D.new()
	var pm = PlaneMesh.new()
	pm.size = Vector2(14, 14)
	floor_m.mesh = pm
	floor_m.material_override = mats.floor
	root.add_child(floor_m)
	for w in [[Vector3(-3.5, 1.7, 0), Vector3(0.2, 3.4, 10.0)], [Vector3(0, 1.7, -3.6), Vector3(8.0, 3.4, 0.2)], [Vector3(0, 1.7, 3.6), Vector3(8.0, 3.4, 0.2)],
			[Vector3(0, 3.45, 0), Vector3(8.0, 0.1, 8.0)]]:
		var b = MeshInstance3D.new()
		var bm = BoxMesh.new()
		bm.size = w[1]
		b.mesh = bm
		b.material_override = mats.wall if w[1].y > 1 else mats.ceiling
		b.position = w[0]
		root.add_child(b)
	var we = WorldEnvironment.new()
	var env = Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.1, 0.1, 0.11)
	env.ambient_light_energy = 0.6
	env.tonemap_mode = Environment.TONE_MAPPER_ACES
	env.fog_enabled = true
	env.fog_light_color = Color(0.03, 0.035, 0.04)
	env.fog_density = 0.03
	env.glow_enabled = true
	we.environment = env
	root.add_child(we)
	var lamp = OmniLight3D.new()
	lamp.position = Vector3(-1.0, 2.7, 1.8)
	lamp.light_color = Color(1.0, 0.7, 0.45)
	lamp.light_energy = 0.8
	lamp.omni_range = 6.0
	root.add_child(lamp)
	var cam = Camera3D.new()
	cam.fov = 58
	root.add_child(cam)
	cam.current = true
	cam.position = Vector3(3.6, 1.6, 0.3)
	cam.look_at(Vector3(0, 1.15, 0), Vector3.UP)
	var fl = SpotLight3D.new()
	fl.light_energy = 4.0
	fl.spot_range = 14.0
	fl.spot_angle = 30.0
	fl.shadow_enabled = true
	fl.light_color = Color(1.0, 0.9, 0.7)
	fl.position = Vector3(0.25, -0.15, 0)
	cam.add_child(fl)
	return [root, cam]


func _intro() -> void:
	var layer = CanvasLayer.new()
	add_child(layer)
	var sp = StudioSplash.new()
	layer.add_child(sp)
	await _wait(1.35)
	await _shot("00_intro_studio")
	sp.queue_free()
	var ls = LoadScreen.new()
	layer.add_child(ls)
	ls.set_progress(60)
	await _wait(0.6)
	await _shot("00_chargement")
	ls.set_progress(100)
	await _wait(1.0)
	await _shot("00_chargement_pret")
	layer.queue_free()
	await _wait(0.2)


func _gallery() -> void:
	# chaque créature face caméra
	var root = _studio()[0]
	var i = 0
	for type in Data.db.MONSTERS.keys():
		var mv = MonsterView.new()
		root.add_child(mv)
		mv.setup("g%d" % i, type, {})
		mv.position = Vector3.ZERO
		mv.rotation.y = 0.15      # modèle orienté +X, caméra côté +X
		var ex = {"disguised": 0, "lantern": 1} if type == "sauveteur" else {}
		var st = "chase" if type in ["sourdine", "echo", "invite", "sauveteur"] else ("control" if type == "inspecteur" else ("windup" if type == "demenageur" else "roam"))
		for f in 12:
			mv.animate({"s": st, "mv": 1, "r": 0, "ex": ex}, 1.0 / 30.0, f / 30.0)
			await get_tree().process_frame
		for f in 3:
			await get_tree().process_frame
		await _shot("02_creature_%d_%s" % [i, type])
		mv.queue_free()
		i += 1
	root.queue_free()
	await _wait(0.2)


func _crew() -> void:
	# l'équipe de Récupérateurs : toutes les tenues, masques et chapeaux, puis les poses
	var studio = _studio()
	var root: Node3D = studio[0]
	var cam: Camera3D = studio[1]
	cam.position = Vector3(4.6, 1.5, 0.0)
	cam.look_at(Vector3(0, 0.75, 0), Vector3.UP)
	var C = Data.db.COSMETICS
	var lineups = []
	var masks = C.mask.map(func(x): return x.id)
	var hats = C.hat.map(func(x): return x.id)
	for row in 3:
		var team = []
		for j in 5:
			var n = row * 5 + j
			team.append({"suit": C.suit[n % C.suit.size()].id, "mask": masks[n % masks.size()] if row > 0 else "visor",
				"hat": hats[n % hats.size()] if row > 0 else ["helmet", "none", "cap", "beanie", "helmet"][j], "light": C.light[n % C.light.size()].id})
		lineups.append(team)
	var poses = [{"st": "alive", "sp": 0.0}, {"st": "alive", "sp": 2.2, "m": "walk"}, {"st": "alive", "sp": 3.6, "m": "sprint"},
		{"st": "alive", "sp": 1.0, "m": "sneak"}, {"st": "alive", "sp": 1.6, "c": "x"}]
	var r = 0
	for team in lineups:
		var views = []
		for j in team.size():
			var v = PlayerView.new()
			root.add_child(v)
			v.setup("c%d" % j, team[j], false, r == 0)
			v.position = Vector3(-0.3 * absf(j - 2), 0, (j - 2) * 0.95)
			v.rotation.y = 0.35 - (j - 2) * 0.12
			views.append(v)
		for f in 20:
			for j in views.size():
				var pose = poses[j] if r == 2 else poses[0]
				var s = {"st": pose.st, "sp": pose.sp, "m": pose.get("m", "walk"), "l": 1, "c": pose.get("c")}
				views[j].animate(s, 1.0 / 30.0, f / 30.0 + j)
			await get_tree().process_frame
		await _shot("03_recuperateurs_%d" % r)
		for v in views:
			v.queue_free()
		r += 1
	# à terre et fantôme
	var a = PlayerView.new()
	root.add_child(a)
	a.setup("d", {"suit": "red"}, false, false)
	a.animate({"st": "downed", "sp": 0.0, "l": 0, "c": null}, 0.03, 0.0)
	a.position = Vector3(0, 0, -0.8)
	var b = PlayerView.new()
	root.add_child(b)
	b.setup("e", {"suit": "blue"}, false, false)
	b.animate({"st": "dead", "sp": 0.0, "l": 0, "c": null}, 0.03, 0.0)
	b.position = Vector3(0, 0, 0.9)
	await _shot("03_recuperateurs_3_a_terre")
	root.queue_free()
	await _wait(0.2)


func _place_monster(gc: Game3D, type: String) -> void:
	var g = gc.g
	var me = gc.me
	var lair = g.map.rooms[0]
	# on cherche une direction libre devant le joueur
	for k in 16:
		var a = me.angle + k * TAU / 16.0
		for d in [3.2, 2.6, 2.0]:
			var x = me.x + cos(a) * d
			var y = me.y + sin(a) * d
			if not g.grid.collides(x, y, 0.45) and g.grid.has_los(me.x, me.y, x, y):
				me.angle = a
				gc.pitch = 0.05
				var m = SimMonster.new(g, type, x, y, lair)
				m.angle = atan2(me.y - y, me.x - x)
				g.monsters.append(m)
				return
