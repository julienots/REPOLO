# Captures d'écran automatiques (lancées en CI sous xvfb, rendu OpenGL logiciel) :
# menu, partie en pilote automatique, galerie des 8 créatures, interface mobile.
extends Node

var out_dir = "user://shots"


func _ready() -> void:
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--out="):
			out_dir = a.substr(6)
	DirAccess.make_dir_recursive_absolute(out_dir)
	get_tree().create_timer(240.0).timeout.connect(func(): get_tree().quit(2))
	await _run()
	print("CAPTURES TERMINÉES")
	get_tree().quit(0)


func _shot(name: String) -> void:
	await RenderingServer.frame_post_draw
	var img = get_viewport().get_texture().get_image()
	var path = out_dir + "/" + name + ".png"
	img.save_png(path)
	print("capture ", path, " ", img.get_size())


func _wait(sec: float) -> void:
	await get_tree().create_timer(sec).timeout


func _run() -> void:
	Profile3D.load_profile()
	# 1. menu
	var main = load("res://scripts/main.gd").new()
	add_child(main)
	await _wait(3.0)
	await _shot("01_menu")
	main.queue_free()
	await _wait(0.3)
	# 2. galerie des créatures
	await _gallery()
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
	# 4. interface tactile
	var gm = Game3D.new()
	gm.setup({"mission": "morvan", "difficulty": "stagiaire", "bots": 2, "seed": 99, "force_mobile": true, "tts": false, "volume": 0.0})
	add_child(gm)
	await _wait(3.0)
	await _shot("09_interface_mobile")
	gm.queue_free()


func _gallery() -> void:
	var root = Node3D.new()
	add_child(root)
	var m = MapGen.generate("warehouse", 5)
	var w = WorldBuilder.new()
	root.add_child(w)
	w.build(m)
	var we = WorldEnvironment.new()
	var env = Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.08, 0.08, 0.09)
	env.ambient_light_energy = 0.5
	env.tonemap_mode = Environment.TONE_MAPPER_ACES
	env.fog_enabled = true
	env.fog_light_color = Color(0.03, 0.035, 0.04)
	env.fog_density = 0.05
	env.glow_enabled = true
	we.environment = env
	root.add_child(we)
	# une grande salle : la plus vaste de la carte
	var best = m.rooms[0]
	for r in m.rooms:
		if r.w * r.h > best.w * best.h and not r.start:
			best = r
	var c = Vector2(best.x + best.w / 2.0, best.y + best.h / 2.0)
	var cam = Camera3D.new()
	cam.fov = 60
	root.add_child(cam)
	cam.current = true
	cam.position = WorldBuilder.to3(c.x - 2.6, c.y, 1.55)
	cam.look_at(WorldBuilder.to3(c.x, c.y, 1.2), Vector3.UP)
	var fl = SpotLight3D.new()
	fl.light_energy = 4.0
	fl.spot_range = 14.0
	fl.spot_angle = 32.0
	fl.shadow_enabled = true
	fl.light_color = Color(1.0, 0.9, 0.7)
	fl.position = Vector3(0.25, -0.15, 0)
	cam.add_child(fl)
	var i = 0
	for type in Data.db.MONSTERS.keys():
		var mv = MonsterView.new()
		root.add_child(mv)
		mv.setup("g%d" % i, type, {})
		mv.position = WorldBuilder.to3(c.x, c.y)
		mv.rotation.y = PI      # face à la caméra (modèle orienté +X, caméra côté -X)
		var ex = {"disguised": 0, "lantern": 1} if type == "sauveteur" else {}
		var st = "chase" if type in ["sourdine", "echo", "invite", "sauveteur"] else ("control" if type == "inspecteur" else ("windup" if type == "demenageur" else "roam"))
		for f in 12:
			mv.animate({"s": st, "mv": 1, "r": 0, "ex": ex}, 1.0 / 30.0, f / 30.0)
			await get_tree().process_frame
		await _shot("02_creature_%d_%s" % [i, type])
		mv.queue_free()
		i += 1
	root.queue_free()
	await _wait(0.2)
