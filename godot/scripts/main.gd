# Point d'entrée de la version 3D : décor animé du menu, lancement des missions,
# application des gains et écran de résultats.
extends Node

var menu: Menu3D
var menu_layer: CanvasLayer
var backdrop: Node3D
var game: Game3D
var t = 0.0
var bd_cam: Camera3D
var bd_monster: MonsterView
var bd_path = []
var net: NetClient
var my_id = ""
var last_lobby = {}
var in_game_online = false


func _ready() -> void:
	Profile3D.load_profile()
	get_viewport().scaling_3d_scale = float(Profile3D.data.settings.get("scale", 1.0))
	_show_menu()


func _show_menu() -> void:
	_build_backdrop()
	menu_layer = CanvasLayer.new()
	add_child(menu_layer)
	menu = Menu3D.new()
	menu_layer.add_child(menu)
	menu.start_requested.connect(_start_game)
	menu.online_requested.connect(_go_online)
	menu.net_send.connect(_net_send)
	menu.leave_requested.connect(_leave_online)


# Décor du menu : un couloir de l'hôtel, une lampe qui grésille, et quelque chose au fond.
func _build_backdrop() -> void:
	backdrop = Node3D.new()
	add_child(backdrop)
	var m = MapGen.generate("hotel", 777)
	var w = WorldBuilder.new()
	backdrop.add_child(w)
	w.build(m)
	var we = WorldEnvironment.new()
	var env = Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0, 0, 0)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.09, 0.06, 0.07)
	env.ambient_light_energy = 0.6
	env.tonemap_mode = Environment.TONE_MAPPER_ACES
	env.fog_enabled = true
	env.fog_light_color = Color(0.05, 0.03, 0.035)
	env.fog_density = 0.06
	env.glow_enabled = true
	we.environment = env
	backdrop.add_child(we)
	# chemin de caméra : on suit l'A* entre deux salles éloignées
	var rooms = m.rooms
	var a = rooms[0]
	var b = rooms[rooms.size() - 1]
	bd_path = Pathfinding.find_path(m.grid, a.x + a.w / 2.0, a.y + a.h / 2.0, b.x + b.w / 2.0, b.y + b.h / 2.0, true, 6000)
	bd_cam = Camera3D.new()
	bd_cam.fov = 70
	backdrop.add_child(bd_cam)
	bd_cam.current = true
	var fl = SpotLight3D.new()
	fl.light_energy = 3.5
	fl.spot_range = 12.0
	fl.spot_angle = 30.0
	fl.shadow_enabled = true
	fl.light_color = Color(1.0, 0.9, 0.7)
	fl.position = Vector3(0.2, -0.2, 0)
	bd_cam.add_child(fl)
	bd_monster = MonsterView.new()
	backdrop.add_child(bd_monster)
	bd_monster.setup("menu", "sourdine", {})
	for d in w.doors.values():
		d.target = 1.0
		d.open = 1.0
		d.panel.rotation.y = 1.75 * d.dir


func _process(delta: float) -> void:
	t += delta
	if backdrop == null or bd_path.size() < 2:
		return
	var seg_len = 2.2
	var total = bd_path.size() - 1
	var u = fmod(t / seg_len, float(total))
	var i = int(u)
	var f = u - i
	var p0 = bd_path[i]
	var p1 = bd_path[mini(i + 1, total)]
	var p2 = bd_path[mini(i + 3, total)]
	var pos = p0.lerp(p1, f)
	var look = p1.lerp(p2, f)
	bd_cam.position = WorldBuilder.to3(pos.x, pos.y, 1.6 + sin(t * 1.7) * 0.03)
	var tgt = WorldBuilder.to3(look.x, look.y, 1.5)
	if tgt.distance_to(bd_cam.position) > 0.1:
		bd_cam.look_at(tgt, Vector3.UP)
	# la créature attend quelques cases plus loin, immobile, tête qui se tord
	var mp = bd_path[mini(i + 4, total)]
	bd_monster.position = WorldBuilder.to3(mp.x, mp.y)
	bd_monster.rotation.y = atan2(-(pos.y - mp.y), pos.x - mp.x)
	bd_monster.animate({"s": "listen", "mv": 0, "r": 0, "ex": {"click": int(t * 1.5)}}, delta, t)


func _start_game(cfg: Dictionary) -> void:
	if backdrop != null:
		backdrop.queue_free()
		backdrop = null
	menu_layer.queue_free()
	game = Game3D.new()
	game.setup(cfg)
	add_child(game)
	game.finished.connect(_on_finished)
	game.quit_requested.connect(_leave_online)


func _on_finished(result: Dictionary) -> void:
	var gain = Profile3D.apply_result(result, my_id if in_game_online else "me")
	game.queue_free()
	game = null
	_show_menu()
	menu.show_results(result, gain, in_game_online)
	in_game_online = false


# ------------------------------------------------------------------ EN LIGNE
func _go_online(action: String, server: String, code: String) -> void:
	if net != null:
		net.close()
		net.queue_free()
	net = NetClient.new()
	add_child(net)
	net.message.connect(_on_net)
	net.status_changed.connect(_on_net_status)
	net.connect_to(server)
	var hello = {"name": Profile3D.data.name, "cosmetics": Profile3D.data.cosmetics, "equipment": Profile3D.data.equipment,
		"platform": "mobile" if OS.has_feature("mobile") else "pc", "level": Profile3D.level_info().level}
	if action == "create":
		net.send({"t": "create", "hello": hello})
	else:
		net.send({"t": "join", "code": code, "hello": hello})


func _on_net_status(st: String) -> void:
	if menu != null and is_instance_valid(menu):
		match st:
			"error":
				menu.set_status("Adresse invalide.")
			"reconnecting":
				menu.set_status("Connexion perdue, nouvelle tentative…")
			"lost":
				menu.show_online("Impossible de joindre le serveur. Vérifiez l'adresse et que le serveur est lancé.")


func _on_net(msg: Dictionary) -> void:
	match msg.get("t"):
		"welcome":
			my_id = String(msg.you)
		"lobby":
			last_lobby = msg
			if game == null and menu != null and is_instance_valid(menu) and String(msg.get("state", "lobby")) == "lobby":
				menu.show_lobby(msg, my_id)
		"error":
			if menu != null and is_instance_valid(menu):
				menu.set_status(String(msg.get("msg", "Erreur")))
		"kicked":
			_leave_online()
		"start":
			if game != null:
				return
			var cs = ClientState.new(net, msg.info, String(msg.you))
			my_id = String(msg.you)
			in_game_online = true
			var s = Profile3D.data.settings
			_start_game({"client_state": cs, "sensitivity": float(s.sensitivity), "volume": float(s.volume), "mic": bool(s.mic), "tts": bool(s.tts),
				"shadows": bool(s.shadows)})


func _net_send(m: Dictionary) -> void:
	if net != null:
		net.send(m)


func _leave_online() -> void:
	if net != null:
		net.close()
		net.queue_free()
		net = null
	if game != null:
		game.queue_free()
		game = null
		_show_menu()
	in_game_online = false
	if menu != null and is_instance_valid(menu):
		menu.show_main()
