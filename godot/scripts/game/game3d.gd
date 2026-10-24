# Partie en 3D, vue à la première personne. La simulation (GameSim, port exact des règles
# de la version web) tourne à 30 Hz ; le rendu interpole entre deux pas. Tout l'affichage
# est construit à partir de l'instantané de la simulation (même format que le serveur).
class_name Game3D
extends Node3D

signal finished(result: Dictionary)
signal quit_requested

const TICK = 1.0 / 30.0
const T = WorldBuilder.T
const EYE = 1.62

var cfg: Dictionary = {}
var g                      # GameSim (solo) ou ClientState (en ligne)
var my_id = "me"
var online = false
var me_prev = Vector2.ZERO
var snap_time = 0.0
var snap_dt = TICK
var me: SimEntities.SimPlayer
var world: WorldBuilder
var cam: Camera3D
var flash: SpotLight3D
var env: Environment
var sfx: Sfx
var hud: Hud
var touch: TouchControls
var post_mat: ShaderMaterial
var ui_layer: CanvasLayer
var pause_panel: Control
var mobile = false
var roster = {}
var views_p = {}
var views_m = {}
var views_i = {}
var prev = {}
var cur = {}
var snap: Dictionary = {}
var acc = 0.0
var pitch = -0.05
var bob = 0.0
var shake_amp = 0.0
var fear = 0.0
var hurt_fx = 0.0
var last_hp = 3
var mon_mem = {}
var crouch_toggle = false
var paused = false
var ended = false
var time_s = 0.0
var held_view: ItemView
var held_id = ""
var sens = 0.0025
var mic_capture: AudioEffectCapture
var mic_level = 0.0
var door_bump_t = 0.0
var flash_flicker = 0.0
var autopilot = false     # captures d'écran / démonstration : le joueur local est un bot
var ghost_alpha = 0.0
var tts_voices = []
var end_t = -1.0


func setup(config: Dictionary) -> void:
	cfg = config


func _ready() -> void:
	mobile = OS.has_feature("mobile") or cfg.get("force_mobile", false)
	sens = 0.0025 * float(cfg.get("sensitivity", 1.0))
	autopilot = cfg.get("autopilot", false)
	_build_sim()
	_build_scene()
	_build_ui()
	if cfg.get("mic", false):
		_start_mic()
	if not autopilot and not mobile:
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	# synthèse vocale : seulement si l'appareil en a une (Android, Windows, macOS ; Linux avec speech-dispatcher)
	if cfg.get("tts", true) and OS.get_name() != "Linux":
		tts_voices = DisplayServer.tts_get_voices_for_language("fr")
	_tick()


# ------------------------------------------------------------------ CONSTRUCTION
func _build_sim() -> void:
	if cfg.has("client_state"):
		online = true
		g = cfg.client_state
		my_id = g.you
		me = g.me()
		for r in g.info.roster:
			roster[String(r.id)] = {"name": r.name, "cosmetics": r.get("cosmetics", {}), "bot": bool(r.get("bot", false)), "botProfile": r.get("botProfile", "")}
		last_hp = me.hp
		me_prev = Vector2(me.x, me.y)
		return
	var team = []
	team.append({"id": "me", "name": cfg.get("name", "Employé"), "isBot": false, "cosmetics": cfg.get("cosmetics", Data.db.DEFAULT_COSMETICS),
		"equipment": cfg.get("equipment", "radio")})
	var profiles = Data.db.BOT_PROFILES.keys()
	var used = {}
	var nb = int(cfg.get("bots", 3))
	var rng = RandomNumberGenerator.new()
	rng.seed = int(cfg.get("seed", 1))
	for i in nb:
		var free = profiles.filter(func(b): return not used.has(b))
		var b = free[rng.randi() % free.size()] if free.size() > 0 else profiles[rng.randi() % profiles.size()]
		used[b] = true
		var prof = Data.db.BOT_PROFILES[b]
		var nm = String(prof.names[0])
		var suit = ["blue", "green", "red", "purple", "pink", "white"][i % 6]
		for s in Data.db.COSMETICS.suit:
			if s.color == prof.suit:
				suit = s.id
		var cos = Data.db.DEFAULT_COSMETICS.duplicate()
		cos.suit = suit
		cos.mask = ["visor", "goggles", "smile", "gas", "paper"][i % 5]
		cos.hat = ["helmet", "beanie", "cap", "none"][i % 4]
		team.append({"id": "bot%d" % (i + 1), "name": nm + " (bot)", "isBot": true, "botProfile": b, "cosmetics": cos,
			"equipment": ["radio", "decoy", "medkit", "sneakers"][i % 4]})
	g = GameSim.new({"seed": int(cfg.get("seed", randi() % 2000000000)), "missionId": cfg.get("mission", "morvan"), "difficulty": cfg.get("difficulty", "employe"),
		"variant": cfg.get("variant", "standard"), "players": team})
	me = g.players["me"]
	if autopilot:
		g.set_bot_control("me", true)
		me.profile = Data.db.BOT_PROFILES.courageux
	for p in g.players.values():
		roster[p.id] = {"name": p.name, "cosmetics": p.cosmetics, "bot": p.is_bot, "botProfile": p.bot_profile}
	last_hp = me.hp


func _build_scene() -> void:
	world = WorldBuilder.new()
	add_child(world)
	world.build(g.map)
	var we = WorldEnvironment.new()
	env = Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0, 0, 0)
	var fogc = String(Data.db.THEMES[g.map.theme].palette.fog).split(",")
	var fog_col = Color(float(fogc[0]) / 255.0, float(fogc[1]) / 255.0, float(fogc[2]) / 255.0)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = fog_col.lightened(0.25)
	env.ambient_light_energy = 0.55
	env.tonemap_mode = Environment.TONE_MAPPER_ACES
	env.tonemap_exposure = 1.1
	env.fog_enabled = true
	env.fog_light_color = fog_col
	env.fog_density = 0.055
	env.glow_enabled = true
	env.glow_intensity = 0.7
	env.glow_bloom = 0.05
	env.glow_hdr_threshold = 1.2
	env.adjustment_enabled = true
	env.adjustment_contrast = 1.08
	env.adjustment_saturation = 0.85
	we.environment = env
	add_child(we)
	cam = Camera3D.new()
	cam.fov = 74.0
	cam.near = 0.05
	cam.far = 70.0
	add_child(cam)
	cam.current = true
	flash = SpotLight3D.new()
	flash.light_color = PlayerView.light_color(me.cosmetics)
	flash.light_energy = 4.0
	flash.spot_range = g.S("flashlightRange") * T
	flash.spot_angle = rad_to_deg(g.S("flashlightFov") / 2.0) + 4.0
	flash.spot_angle_attenuation = 0.85
	flash.spot_attenuation = 0.9
	flash.shadow_enabled = cfg.get("shadows", true)
	flash.shadow_bias = 0.04
	flash.position = Vector3(0.18, -0.2, 0.05)
	cam.add_child(flash)
	sfx = Sfx.new()
	add_child(sfx)
	sfx.set_master(float(cfg.get("volume", 0.8)))
	sfx.preload_common()
	sfx.start_ambience()
	# vue de soi : corps visible en baissant les yeux
	var mine = PlayerView.new()
	add_child(mine)
	mine.setup(my_id, me.cosmetics, true, false)
	views_p[my_id] = mine
	if autopilot:
		mine.visible = false


func _build_ui() -> void:
	ui_layer = CanvasLayer.new()
	add_child(ui_layer)
	var post = ColorRect.new()
	post.set_anchors_preset(Control.PRESET_FULL_RECT)
	post.mouse_filter = Control.MOUSE_FILTER_IGNORE
	post_mat = ShaderMaterial.new()
	post_mat.shader = preload("res://shaders/post.gdshader")
	post.material = post_mat
	ui_layer.add_child(post)
	hud = Hud.new()
	ui_layer.add_child(hud)
	hud.build(mobile)
	touch = TouchControls.new()
	ui_layer.add_child(touch)
	touch.visible = mobile and not autopilot
	touch.look_sens = 0.0045 * float(cfg.get("sensitivity", 1.0))
	touch.button_pressed.connect(_on_action_pressed)
	touch.button_released.connect(_on_action_released)
	pause_panel = _make_pause()
	ui_layer.add_child(pause_panel)
	pause_panel.visible = false
	var info = g.start_info()
	hud.flash_center("%s\n%s" % [info.mission.name, info.mission.brief], 6.0)


func _make_pause() -> Control:
	var root = ColorRect.new()
	root.color = Color(0, 0, 0, 0.7)
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	var box = VBoxContainer.new()
	box.set_anchors_preset(Control.PRESET_CENTER)
	box.position = Vector2(-160, -120)
	box.custom_minimum_size = Vector2(320, 240)
	box.add_theme_constant_override("separation", 14)
	root.add_child(box)
	var title = Label.new()
	title.text = "PAUSE"
	title.add_theme_font_size_override("font_size", 34)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(title)
	for b in [["Reprendre", func(): _set_paused(false)], ["Abandonner la mission", func(): _abandon()]]:
		var btn = Button.new()
		btn.text = b[0]
		btn.custom_minimum_size = Vector2(320, 56)
		btn.add_theme_font_size_override("font_size", 22)
		btn.pressed.connect(b[1])
		box.add_child(btn)
	var help = Label.new()
	help.text = "PC : ZQSD/WASD bouger · Maj courir · Ctrl/C s'accroupir · E action (maintenir pour relever / levier)\nClic gauche ou G lancer · F objet · L/clic droit lampe · Échap pause"
	help.add_theme_font_size_override("font_size", 14)
	help.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	help.custom_minimum_size = Vector2(320, 0)
	box.add_child(help)
	return root


func _set_paused(v: bool) -> void:
	paused = v
	pause_panel.visible = v
	if not mobile and not autopilot:
		Input.mouse_mode = Input.MOUSE_MODE_VISIBLE if v else Input.MOUSE_MODE_CAPTURED


func _abandon() -> void:
	if online:
		quit_requested.emit()
		return
	paused = false
	pause_panel.visible = false
	if not g.mission.ended:
		g.finish("abandon")
		_tick_messages(g.snapshot())


# ------------------------------------------------------------------ MICRO (voix réelle → bruit)
func _start_mic() -> void:
	if OS.get_name() == "Android":
		OS.request_permissions()
	var idx = AudioServer.get_bus_index("Micro")
	if idx == -1:
		AudioServer.add_bus()
		idx = AudioServer.bus_count - 1
		AudioServer.set_bus_name(idx, "Micro")
		AudioServer.set_bus_mute(idx, true)
		mic_capture = AudioEffectCapture.new()
		AudioServer.add_bus_effect(idx, mic_capture)
	else:
		mic_capture = AudioServer.get_bus_effect(idx, 0)
	var p = AudioStreamPlayer.new()
	p.stream = AudioStreamMicrophone.new()
	p.bus = "Micro"
	add_child(p)
	p.play()


func _read_mic() -> void:
	if mic_capture == null:
		return
	var n = mic_capture.get_frames_available()
	if n <= 0:
		return
	var buf = mic_capture.get_buffer(n)
	var peak = 0.0
	for f in buf:
		peak = maxf(peak, maxf(absf(f.x), absf(f.y)))
	mic_level = lerpf(mic_level, clampf((peak - 0.04) * 1.6, 0.0, 1.0), 0.5)


# ------------------------------------------------------------------ ENTRÉES
func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED and not paused:
		_look(event.relative * sens)
	elif event is InputEventKey and event.pressed and not event.echo:
		var a = _key_action(event)
		if a != "":
			_on_action_pressed(a)
	elif event is InputEventKey and not event.pressed:
		var a = _key_action(event)
		if a != "":
			_on_action_released(a)
	elif event is InputEventMouseButton and not mobile:
		if Input.mouse_mode != Input.MOUSE_MODE_CAPTURED and event.pressed and not paused and not ended:
			Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
			return
		var a = ""
		if event.button_index == MOUSE_BUTTON_LEFT:
			a = "throw"
		elif event.button_index == MOUSE_BUTTON_RIGHT:
			a = "light"
		if a != "":
			if event.pressed:
				_on_action_pressed(a)
			else:
				_on_action_released(a)


func _key_action(e: InputEventKey) -> String:
	match e.physical_keycode:
		KEY_E, KEY_SPACE, KEY_ENTER:
			return "action"
		KEY_G:
			return "throw"
		KEY_F:
			return "use"
		KEY_L, KEY_T:
			return "light"
		KEY_C:
			return "crouch"
		KEY_ESCAPE, KEY_P:
			return "pause"
	return ""


func _look(d: Vector2) -> void:
	if me.hidden != 0 and me.state == "alive":
		d *= 0.3
	me.angle = wrapf(me.angle + d.x, -PI, PI)
	pitch = clampf(pitch - d.y, -1.35, 1.35)


func _on_action_pressed(a: String) -> void:
	if a == "pause":
		if not ended:
			_set_paused(not paused)
		return
	if paused or ended or autopilot:
		return
	match a:
		"action":
			g.interact(me)
			sfx.play_ui("ui", -18.0)
		"throw":
			if me.carry != "":
				g.throw_item(me)
		"use":
			g.use_utility(me)
		"light":
			if me.battery > 0 and me.state == "alive":
				me.light = not me.light
				sfx.play_ui("ui", -14.0)
		"crouch":
			crouch_toggle = not crouch_toggle


func _on_action_released(a: String) -> void:
	if a == "action" and not autopilot:
		g.release(me)


func _move_input() -> Dictionary:
	var v = Vector2.ZERO
	var mode = "walk"
	if mobile:
		v = touch.move
		v.y = -v.y
		if touch.sprint:
			mode = "sprint"
		if touch.toggles.crouch:
			mode = "sneak"
	else:
		if Input.is_physical_key_pressed(KEY_W) or Input.is_physical_key_pressed(KEY_UP):
			v.y += 1
		if Input.is_physical_key_pressed(KEY_S) or Input.is_physical_key_pressed(KEY_DOWN):
			v.y -= 1
		if Input.is_physical_key_pressed(KEY_D) or Input.is_physical_key_pressed(KEY_RIGHT):
			v.x += 1
		if Input.is_physical_key_pressed(KEY_A) or Input.is_physical_key_pressed(KEY_LEFT):
			v.x -= 1
		v = v.limit_length(1.0)
		if Input.is_physical_key_pressed(KEY_SHIFT):
			mode = "sprint"
		if Input.is_physical_key_pressed(KEY_CTRL) or crouch_toggle:
			mode = "sneak"
	# avant/arrière + pas de côté → direction dans le plan de la carte
	var a = me.angle
	var mx = cos(a) * v.y - sin(a) * v.x
	var my = sin(a) * v.y + cos(a) * v.x
	return {"mx": mx, "my": my, "mode": mode, "len": v.length()}


# ------------------------------------------------------------------ BOUCLE
func _process(delta: float) -> void:
	time_s += delta
	if mobile and not paused:
		_look(touch.take_look())
	if not paused and not ended:
		acc += minf(delta, 0.1)
		var steps = 0
		while acc >= TICK and steps < 4:
			_tick()
			acc -= TICK
			steps += 1
	_render(clampf((time_s - snap_time) / snap_dt, 0.0, 1.0), clampf(acc / TICK, 0.0, 1.0), delta)
	hud.tick(delta)
	if ended and end_t >= 0 and time_s > end_t and not g.result.is_empty():
		end_t = -1.0
		finished.emit(g.result)


func _tick() -> void:
	if g.mission.ended:
		return
	_read_mic()
	me_prev = Vector2(me.x, me.y)
	if not autopilot:
		var inp = _move_input()
		var can_move = me.state in ["alive", "downed", "dead"] and me.hidden == 0
		if can_move:
			var px = me.x
			var py = me.y
			g.step_movement(me, inp.mx, inp.my, inp.mode, g.player_env(me), TICK)
			me.move_mode = inp.mode
			door_bump_t -= TICK
			if inp.len > 0.2 and me.state == "alive" and door_bump_t <= 0 and Vector2(me.x - px, me.y - py).length() < 0.5 * TICK * g.S("walkSpeed"):
				var l = Vector2(inp.mx, inp.my).normalized()
				var tx = int(floor(me.x + l.x * 0.6))
				var ty = int(floor(me.y + l.y * 0.6))
				if g.grid.get_t(tx, ty) == Grid.DOOR and g.grid.door_open[g.grid.idx(tx, ty)] == 0:
					door_bump_t = 0.4
					g.bump_door(me, tx, ty)
		if mic_level > 0.02:
			g.set_voice(me, mic_level, false)
	g.step(TICK)
	var fresh = g.snapshot()
	if fresh.is_empty():
		return
	snap = fresh
	prev = cur.duplicate()
	snap_dt = clampf(time_s - snap_time, TICK, 0.25)
	snap_time = time_s
	cur = {}
	for p in snap.players:
		cur[p.id] = Vector2(p.x, p.y)
	for m in snap.monsters:
		cur[m.id] = Vector2(m.x, m.y)
	for it in snap.items:
		cur[it.id] = Vector2(it.x, it.y)
	_sync_views()
	_tick_noises(snap.noises)
	_tick_messages(snap)
	_monster_cues()


func _interp(id: String, alpha: float) -> Vector2:
	var c = cur.get(id, Vector2.ZERO)
	var p = prev.get(id, c)
	if p.distance_to(c) > 3.0:
		return c
	return p.lerp(c, alpha)


func _sync_views() -> void:
	var seen = {}
	for p in snap.players:
		seen[p.id] = true
		if not views_p.has(p.id):
			var v = PlayerView.new()
			add_child(v)
			v.setup(p.id, roster.get(p.id, {}).get("cosmetics", {}), false, true)
			views_p[p.id] = v
	seen = {}
	for m in snap.monsters:
		seen[m.id] = true
		if not views_m.has(m.id):
			var v = MonsterView.new()
			add_child(v)
			var cos = {}
			for id in roster:
				cos[id] = roster[id].cosmetics
			v.setup(m.id, m.k, cos)
			views_m[m.id] = v
			v.cur_yaw = -float(m.a)
	for id in views_m.keys():
		if not seen.has(id):
			views_m[id].queue_free()
			views_m.erase(id)
	seen = {}
	for it in snap.items:
		seen[it.id] = true
		if not views_i.has(it.id):
			var v = ItemView.new()
			add_child(v)
			v.setup(it.id, it.k)
			views_i[it.id] = v
	for id in views_i.keys():
		if not seen.has(id):
			views_i[id].queue_free()
			views_i.erase(id)


func _render(alpha: float, me_alpha: float, dt: float) -> void:
	if snap.is_empty():
		return
	var t = time_s
	var mps = {}
	for p in snap.players:
		mps[p.id] = p
	var ms = mps.get(my_id, {})
	# caméra
	var mp = me_prev.lerp(Vector2(me.x, me.y), me_alpha) if not autopilot else _interp(my_id, alpha)
	var eye = EYE
	var st = me.state
	if st == "downed":
		eye = 0.45
	elif st == "alive" and me.move_mode == "sneak":
		eye = 1.12
	elif st == "dead":
		eye = 1.9
	var spd = float(ms.get("sp", 0.0))
	bob += dt * spd * 2.6
	var bob_y = sin(bob * 2.0) * 0.035 * clampf(spd / 3.0, 0.0, 1.5)
	var bob_x = cos(bob) * 0.025 * clampf(spd / 3.0, 0.0, 1.5)
	var yaw = -me.angle - PI / 2.0
	if me.hidden != 0:
		for l in g.map.lockers:
			if int(l.id) == me.hidden:
				mp = Vector2(l.x, l.y)
		eye = 1.5
	shake_amp = maxf(0.0, shake_amp - dt * 3.0)
	var sh = Vector3(randf_range(-1, 1), randf_range(-1, 1), randf_range(-1, 1)) * shake_amp * 0.03
	cam.position = WorldBuilder.to3(mp.x, mp.y, eye + bob_y) + Vector3(cos(-me.angle + PI / 2) * bob_x, 0, 0) + sh
	cam.rotation = Vector3(pitch, yaw, sin(bob) * 0.006 * spd + (0.5 if st == "downed" else 0.0))
	# lampe torche
	flash_flicker -= dt
	var light_on = me.light and me.battery > 0 and st == "alive" and me.hidden == 0
	var fl_energy = 4.0 * (0.6 + 0.4 * clampf(me.battery * 4.0, 0.0, 1.0))
	if me.flicker_t > 0 or float(snap.mods.get("fk", 0)) > 0 or me.battery < 0.12:
		if fmod(t * 17.0, 1.0) < 0.35:
			fl_energy *= 0.1
	flash.visible = light_on
	flash.light_energy = fl_energy
	flash.spot_range = g.S("flashlightRange") * T * float(snap.mods.get("fr", 1.0)) * (1.3 if me.equipment == "bigLight" else 1.0)
	# éclairage ambiant (événements « black-out », « surtension »...)
	var al = float(snap.mods.get("al", 1.0))
	env.ambient_light_energy = 0.12 + 0.45 * al if st != "dead" else 1.4
	world.update_lamps(snap.lamps, cam.position, t, al, float(snap.mods.get("fk", 0)))
	world.update_doors(snap.doors, dt)
	world.set_lever_ready(int(snap.mission.d) >= int(snap.mission.q))
	# autres joueurs
	for p in snap.players:
		var v: PlayerView = views_p.get(p.id)
		if v == null:
			continue
		var pos = _interp(p.id, alpha)
		if p.id == my_id and not autopilot:
			pos = mp
		v.position = WorldBuilder.to3(pos.x, pos.y)
		var a = float(p.a) if p.id != my_id else me.angle
		v.rotation.y = lerp_angle(v.rotation.y, -a, minf(1.0, dt * 14.0))
		v.animate(p, dt, t)
		if p.id == my_id:
			v.visible = false     # vue subjective : on ne dessine pas son propre corps
		if p.st == "dead" and st != "dead":
			v.visible = false     # les fantômes ne sont visibles que des autres fantômes
	# créatures
	var nearest = 99.0
	for m in snap.monsters:
		var v: MonsterView = views_m.get(m.id)
		if v == null:
			continue
		var pos = _interp(m.id, alpha)
		v.position = WorldBuilder.to3(pos.x, pos.y)
		v.cur_yaw = lerp_angle(v.cur_yaw, -float(m.a), minf(1.0, dt * 10.0))
		v.rotation.y = v.cur_yaw
		v.animate(m, dt, t)
		var ex = m.get("ex", {})
		var disguised = (m.k == "invite" and ex.get("as") != null) or (m.k == "sauveteur" and int(ex.get("disguised", 0)) == 1)
		if not disguised and m.s != "rest" and m.s != "dormant":
			nearest = minf(nearest, Vector2(m.x - me.x, m.y - me.y).length())
	# objets
	for it in snap.items:
		var v: ItemView = views_i.get(it.id)
		if v == null:
			continue
		var pos = _interp(it.id, alpha)
		var h = 0.0
		var carrier = it.get("c")
		if carrier != null and cur.has(carrier):
			var cp = _interp(carrier, alpha)
			var ca = float(mps[carrier].a) if mps.has(carrier) else 0.0
			if carrier == my_id:
				# objet porté par soi : devant la caméra
				cp = mp
				ca = me.angle
				h = eye - 0.95
			else:
				h = 0.85
			pos = cp + Vector2(cos(ca), sin(ca)) * 0.45
		elif float(it.get("f", 0.0)) > 0:
			h = float(it.f) * 2.0
		v.position = WorldBuilder.to3(pos.x, pos.y, h)
		v.animate(it, dt, t)
		v.visible = true
	# effets plein écran
	fear = lerpf(fear, clampf((9.0 - nearest) / 7.0, 0.0, 1.0), minf(1.0, dt * 3.0))
	if me.hp < last_hp:
		hurt_fx = 1.0
		shake_amp = maxf(shake_amp, 2.5)
	last_hp = me.hp
	hurt_fx = maxf(0.0, hurt_fx - dt * 1.2)
	post_mat.set_shader_parameter("fear", fear if st == "alive" else 0.0)
	post_mat.set_shader_parameter("hurt", hurt_fx)
	post_mat.set_shader_parameter("downed", 1.0 if st == "downed" else 0.0)
	post_mat.set_shader_parameter("time_s", t)
	post_mat.set_shader_parameter("desat", 0.6 if st == "dead" else 0.15)
	sfx.update_ambience(dt, fear if st == "alive" else 0.0, cam.position)
	hud.update_state(snap, ms, g.mission_def.name, roster, _prompt_text())


# Ce que ferait le bouton « Action » maintenant (même ordre de priorité que la simulation).
func _prompt_text() -> String:
	if me.state == "dead":
		return "[Action] Bouh !"
	if me.state != "alive":
		return ""
	if me.hidden != 0:
		return "[Action] Sortir du casier"
	var r = g.S("interactRange")
	for o in g.players.values():
		if o != me and o.state == "downed" and Vector2(o.x - me.x, o.y - me.y).length() < r:
			return "[Maintenir Action] Relever %s" % o.name
	var lv = g.map.lever
	if Vector2(lv.x - me.x, lv.y - me.y).length() < r:
		if g.mission.departing:
			return "Départ en cours !"
		if g.mission.deposited >= g.mission.quota:
			return "[Maintenir Action] Tirer le levier : DÉPART"
		return "Levier bloqué : quota non atteint"
	for e in g.map.elevators:
		if Vector2(e.x - me.x, e.y - me.y).length() < 0.9:
			return "[Action] Monte-charge"
	if me.carry != "":
		var it = g.items.get(me.carry)
		return "[Action] Poser  ·  [Lancer] Jeter %s" % (it.def.name if it else "")
	var best = null
	var bs = INF
	for it in g.items.values():
		if it.fall_t > 0:
			continue
		var d = Vector2(it.x - me.x, it.y - me.y).length()
		if d > r + it.radius():
			continue
		if it.carried_by != "" and (it.weight() < 3 or it.helper != "" or not g.players.has(it.carried_by)):
			continue
		var facing = absf(angle_difference(me.angle, atan2(it.y - me.y, it.x - me.x)))
		var sc = d + (0.5 if facing > 1.2 else 0.0)
		if sc < bs:
			bs = sc
			best = it
	if best != null:
		if best.carried_by != "":
			return "[Action] Aider à porter : %s" % best.def.name
		var w = ["", "léger", "moyen", "lourd", "très lourd"][clampi(best.weight(), 0, 4)]
		return "[Action] Ramasser %s — %d cr (%s)" % [best.def.name, int(best.value), w]
	var door = g.nearest_door(me.x, me.y, r + 0.3)
	if door != null:
		return "[Action] %s la porte" % ("Ouvrir" if g.grid.door_open[door.i] == 0 else "Fermer")
	for l in g.map.lockers:
		if Vector2(l.x - me.x, l.y - me.y).length() < r:
			return "[Action] Se cacher dans le casier"
	return ""


# ------------------------------------------------------------------ SONS
func _monster_type(id: String) -> String:
	for m in snap.monsters:
		if m.id == id:
			return m.k
	return ""


func _tick_noises(list: Array) -> void:
	for n in list:
		var nm = String(n.t)
		var own = n.s == my_id
		var pos = WorldBuilder.to3(float(n.x), float(n.y), 0.3)
		var loud = float(n.l)
		var vol = lerpf(-22.0, 2.0, clampf(loud / 12.0, 0.0, 1.0)) - (7.0 if own else 0.0)
		var pitch_s = randf_range(0.92, 1.08)
		var mt = _monster_type(String(n.s)) if String(n.s).begins_with("m") else ""
		if nm == "voice" or nm == "scream":
			if int(n.mi) == 1:
				nm = "mimic"
			elif own:
				continue
		if nm == "kaching":
			continue
		if mt == "demenageur" and nm == "step":
			continue      # ses pas sont joués via son signal « stomp »
		if nm == "monster":
			match mt:
				"demenageur":
					nm = "roar"
				"inspecteur":
					nm = "whistle"
				"sauveteur":
					nm = "reveal"
				"invite":
					nm = "shriek"
		if int(n.mi) == 1:
			pitch_s *= 1.0 + float(n.dt) * 3.0
		if nm in ["step", "step_debris", "step_grate"]:
			pos.y = 0.05
		sfx.play_at(nm, pos, vol, pitch_s)


func _monster_cues() -> void:
	for m in snap.monsters:
		var mem = mon_mem.get(m.id, {"bellT": 0.0, "keysT": 0.0, "skitT": 0.0})
		var ex = m.get("ex", {})
		var pos = WorldBuilder.to3(float(m.x), float(m.y), 1.6)
		var d = Vector2(float(m.x) - me.x, float(m.y) - me.y).length()
		if mem.has("click") and ex.get("click") != mem.click:
			sfx.play_at("click", pos, -2.0, randf_range(0.95, 1.05))
		if mem.has("creak") and ex.get("creak") != mem.creak:
			sfx.play_at("creak", pos, 0.0)
		if mem.has("stomp") and ex.get("stomp") != mem.stomp:
			sfx.play_at("stomp", WorldBuilder.to3(float(m.x), float(m.y), 0.1), 4.0 if m.s == "charge" else -2.0)
			if d < 7:
				shake_amp = maxf(shake_amp, 3.0 if m.s == "charge" else 1.0)
		if m.k == "berger" and time_s > mem.bellT:
			mem.bellT = time_s + 1.6
			sfx.play_at("bell", pos, -14.0 + float(ex.get("bell", 0)) * 4.0)
		if m.k == "inspecteur" and int(m.mv) == 1 and time_s > mem.keysT:
			mem.keysT = time_s + 2.2
			sfx.play_at("keys", WorldBuilder.to3(float(m.x), float(m.y), 0.9), -6.0)
		if m.k == "echo" and int(m.mv) == 1 and time_s > mem.skitT:
			mem.skitT = time_s + 1.5 + randf() * 2.0
			sfx.play_at("skitter", WorldBuilder.to3(float(m.x), float(m.y), 0.2), -6.0)
		var hunting = m.s in ["chase", "charge", "lunge", "reveal"]
		if hunting and mem.get("s", "") != m.s and d < 16 and m.k != "mannequine":
			sfx.play_ui("stinger", lerpf(-4.0, -16.0, d / 16.0))
		if m.k == "demenageur" and m.s == "stunned" and mem.get("s", "") != "stunned":
			sfx.play_at("bonk", pos, 4.0)
		mem.click = ex.get("click")
		mem.creak = ex.get("creak")
		mem.stomp = ex.get("stomp")
		mem.s = m.s
		mon_mem[m.id] = mem


# ------------------------------------------------------------------ MESSAGES
func _entity_pos(id: String):
	if cur.has(id):
		return cur[id]
	return null


func _tick_messages(s: Dictionary) -> void:
	for m in s.get("msgs", []):
		match m.k:
			"bubble":
				var src = _entity_pos(m.id)
				if src == null and m.has("x"):
					src = Vector2(m.x, m.y)
				if src == null:
					continue
				var speaker = roster.get(m.id, {}).get("name", "")
				var kind = String(m.kind)
				var mon = null
				for mm in snap.get("monsters", []):
					if mm.id == m.id:
						mon = mm
				if kind == "mimic":
					speaker = "???"
				elif kind == "disguised":
					var as_id = mon.ex.get("as") if mon != null else null
					speaker = roster.get(as_id, {}).get("name", "???") if as_id != null else "???"
				elif kind == "monster" or kind == "rescuer":
					speaker = Data.db.MONSTERS[mon.k].name if mon != null else "???"
				var d = Vector2(src.x - me.x, src.y - me.y).length()
				var lim = 22.0 if kind == "monster" else 15.0
				if d > lim:
					continue
				if kind == "ghost" and me.state != "dead":
					continue
				hud.subtitle(speaker, m.text, kind, d / lim)
				if kind == "bot" and d < 12 and tts_voices.size() > 0 and cfg.get("tts", true):
					var prof = roster.get(m.id, {}).get("botProfile", "")
					var pitch_v = {"panique": 1.5, "comique": 1.25, "courageux": 0.85, "prudent": 0.95, "cupide": 1.05, "protecteur": 0.9}.get(prof, 1.0)
					var idx = roster.keys().find(m.id) % tts_voices.size()
					DisplayServer.tts_speak(m.text, tts_voices[idx], int(100 * pow(1.0 - d / 12.0, 1.2)), pitch_v, 1.35 if prof == "panique" else 1.1)
			"announce":
				hud.feed(m.text, m.kind)
				if m.kind == "event":
					sfx.play_ui("stinger", -10.0)
			"private":
				if m.to == my_id:
					hud.feed(m.text, "private")
			"sfx":
				sfx.play_at(m.name, WorldBuilder.to3(float(m.x), float(m.y), 1.0), 0.0)
				if m.name in ["smash", "wallbreak"]:
					_shake_near(m.x, m.y, 6.0)
			"shake":
				_shake_near(m.x, m.y, float(m.amp) * 3.0)
			"end":
				ended = true
				sfx.play_ui("celebrate" if m.success else "fail", -4.0)
				end_t = time_s + 2.5
				hud.flash_center("MISSION RÉUSSIE" if m.success else "MISSION ÉCHOUÉE", 3.0)
				if not mobile:
					Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	if s.has("mission") and int(s.mission.get("end", 0)) == 1 and not ended:
		ended = true
		end_t = time_s + 2.5


func _shake_near(x: float, y: float, amp: float) -> void:
	var d = Vector2(x - me.x, y - me.y).length()
	if d < 12:
		shake_amp = maxf(shake_amp, amp * (1.0 - d / 12.0))


func _exit_tree() -> void:
	if online and g.net.message.is_connected(g._on_message):
		g.net.message.disconnect(g._on_message)
	if not autopilot:
		Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	if not tts_voices.is_empty():
		DisplayServer.tts_stop()
