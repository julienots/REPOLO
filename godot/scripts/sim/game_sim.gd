# LA PARTIE — port GDScript de shared/sim/game.js (+ items.js, noise.js, perception.js, movement.js).
# Mêmes règles que le serveur ; snapshot() produit le même format que le serveur (multijoueur croisé).
class_name GameSim
extends RefCounted

const SP := SimEntities.SimPlayer
const SI := SimEntities.SimItem

var seed_value: int
var rng: Rng
var mission_id: String
var mission_def: Dictionary
var diff_id: String
var diff: Dictionary
var variant: Dictionary
var noise_mul = 1.0
var time = 0.0
var map: Dictionary
var grid: Grid
var room_grid: PackedInt32Array
var players = {}            # id -> SimPlayer (ordre d'insertion conservé)
var items = {}              # id -> SimItem
var monsters = []
var noises = []
var net_noises = []
var out_msgs = []
var mods: Dictionary = {}
var monster_mods: Dictionary = {}
var flares = []
var pings = []
var flags = {}
var fake_van = null
var quest = null
var customer = null
var tile_changes = []
var highlights = []
var extracted = []
var mission: Dictionary
var director
var spawner
var chatter
var side_objectives = []
var result: Dictionary = {}
var next_item_id = 1
var next_noise_id = 1
var aggro_t = 0.0
var _sim: Dictionary


func _init(opts: Dictionary) -> void:
	_sim = Data.db.SIM
	seed_value = int(opts.get("seed", randi() % 2147483647))
	rng = Rng.new(seed_value ^ 0x5bd1e995)
	var missions: Dictionary = Data.db.MISSIONS
	mission_id = opts.get("missionId", "morvan")
	if not missions.has(mission_id):
		mission_id = "morvan"
	mission_def = missions[mission_id]
	diff_id = opts.get("difficulty", "employe")
	if not Data.db.DIFFICULTIES.has(diff_id):
		diff_id = "employe"
	diff = Data.db.DIFFICULTIES[diff_id]
	variant = Data.db.VARIANTS[0]
	var want_v: String = opts.get("variant", "standard")
	for v in Data.db.VARIANTS:
		if v.id == want_v:
			variant = v
	if want_v == "random":
		var ws = []
		for v in Data.db.VARIANTS:
			ws.append(v.weight)
		variant = rng.weighted(Data.db.VARIANTS, ws)
	noise_mul = float(variant.get("noiseMul", 1.0))
	map = MapGen.generate(mission_def.theme, seed_value, float(variant.get("lootMul", 1.0)))
	grid = map.grid
	room_grid = MapGen.build_room_grid(map)
	if variant.get("noLamps", false):
		for l in map.lamps:
			var r = room_at(l.x, l.y)
			if r == null or not r.start:
				l.on = false
	var time_limit: float = round(float(mission_def.time) * float(diff.timeMul) * float(variant.get("timeMul", 1.0)))
	var nplayers: int = opts.get("players", []).size()
	mission = {
		"quota": round(float(mission_def.quota) * float(diff.quotaMul) * float(variant.get("quotaMul", 1.0)) * (0.7 + 0.1 * mini(4, nplayers)) / 10.0) * 10.0,
		"deposited": 0.0, "bonus": 0.0, "timeLimit": time_limit, "timeLeft": time_limit, "departing": false, "departT": 0.0,
		"ended": false, "success": false, "aggro": false, "quotaReachedSignaled": false, "endReason": "", "wipeT": 0.0, "alerts": 0, "engineT": 0.0,
	}
	var loot_total = 0.0
	for it in map.items:
		var created = create_item(it.type, it.x, it.y, it.get("secret", false))
		if variant.get("heavyBias", false) and created.weight() >= 3:
			created.base_value = round(created.base_value * 1.3)
			created.value = created.base_value
		if not it.get("secret", false):
			loot_total += created.base_value
	mission.quota = minf(mission.quota, round(loot_total * 0.6 / 10.0) * 10.0)
	mission.lootTotal = loot_total
	mods = SimDirector.default_mods()
	director = SimDirector.new(self)
	chatter = SimChatter.new(self)
	spawner = SimSpawner.new(self, mission_def, diff, opts.get("monsters", []))
	for p in opts.get("players", []):
		add_player(p)
	var so: Array = Data.db.SIDE_OBJECTIVES.duplicate()
	side_objectives = rng.shuffle(so).slice(0, 2)
	director.recompute()


func S(key: String) -> float:
	return float(_sim[key])


# ------------------------------------------------------------------ JOUEURS
func add_player(info: Dictionary) -> SimEntities.SimPlayer:
	var sp: Dictionary = map.spawn
	var n = players.size()
	var pos = grid.unstick(sp.x + (n % 4) * 0.8 - 1.2, sp.y - floor(n / 4.0) * 0.8, S("playerRadius"))
	var p = SP.new(info)
	if not Data.db.EQUIPMENT.has(p.equipment):
		p.equipment = "radio"
	var ch = Data.db.EQUIPMENT[p.equipment].charges
	p.charges = int(ch) if ch != null else 0
	p.profile = Data.db.BOT_PROFILES.get(p.bot_profile, Data.db.BOT_PROFILES.prudent)
	p.x = pos.x
	p.y = pos.y
	p.px = p.x
	p.py = p.y
	p.hp = int(S("maxHp"))
	if p.is_bot:
		p.brain = SimBotBrain.new(self, p)
	players[p.id] = p
	return p


func set_bot_control(id: String, on: bool) -> void:
	var p: SP = players.get(id)
	if p == null:
		return
	p.bot_control = on
	if on:
		p.brain = SimBotBrain.new(self, p)
		release(p)
	else:
		p.brain = null
		p.tp += 1


func humans() -> Array:
	return players.values().filter(func(p): return not p.is_bot)


func alive_players() -> Array:
	return players.values().filter(func(p): return p.state == "alive")


func in_van(x: float, y: float) -> bool:
	var v: Dictionary = map.van
	return x >= v.x and x <= v.x + v.w and y >= v.y and y <= v.y + v.h


func locker_occupants(id: int) -> Array:
	return players.values().filter(func(p): return p.hidden == id)


func room_at(x: float, y: float):
	var tx = int(floor(x))
	var ty = int(floor(y))
	if tx < 0 or ty < 0 or tx >= map.w or ty >= map.h:
		return null
	var i = room_grid[ty * map.w + tx]
	return map.rooms[i] if i >= 0 else null


func random_point_in_room(room):
	if room == null:
		return null
	for _i in 30:
		var x = rng.int_range(room.x, room.x + room.w - 1)
		var y = rng.int_range(room.y, room.y + room.h - 1)
		if not grid.blocks_move(x, y) and not grid.collides(x + 0.5, y + 0.5, 0.42):
			return Vector2(x + 0.5, y + 0.5)
	return null


func player_env(p: SP) -> Dictionary:
	var speed_mul = 1.0
	var it: SI = items.get(p.carry) if p.carry != "" else null
	if it:
		var w = it.weight()
		var helped: bool = it.helper != "" and players.has(it.helper) and players[it.helper].state == "alive"
		if w >= 4:
			speed_mul = 0.85 if helped else (0.38 if it.def.get("twoHanded", false) else 0.5)
		elif w == 3:
			speed_mul = 0.92 if helped else 0.7
		elif w == 2:
			speed_mul = 0.9
	for o in items.values():
		if o.helper == p.id:
			speed_mul = minf(speed_mul, 0.85)
	var friction: float = float(mods.friction) * (0.8 if p.equipment == "sneakers" else 1.0)
	return {"speedMul": speed_mul, "friction": friction}


func speed_for(mode: String, p: SP) -> float:
	if p.state == "downed":
		return S("crawlSpeed")
	if p.state == "dead":
		return S("ghostSpeed")
	if mode == "sneak":
		return S("sneakSpeed")
	if mode == "sprint" and p.stamina > 0.05:
		return S("sprintSpeed")
	return S("walkSpeed")


# Déplacement (bots côté simulation, joueur local côté client) : identique à movement.js
func step_movement(p: SP, mx: float, my: float, mode: String, env: Dictionary, dt: float) -> void:
	var length = sqrt(mx * mx + my * my)
	if length > 1.0:
		mx /= length
		my /= length
	var spd = speed_for(mode, p) * (1.0 if p.state == "dead" else float(env.get("speedMul", 1.0)))
	var accel = 12.0 * float(env.get("friction", 1.0))
	var k = minf(1.0, accel * dt)
	p.vx += (mx * spd - p.vx) * k
	p.vy += (my * spd - p.vy) * k
	if p.state == "dead":
		p.x = clampf(p.x + p.vx * dt, 0.5, map.w - 0.5)
		p.y = clampf(p.y + p.vy * dt, 0.5, map.h - 0.5)
		return
	var r = grid.move_circle(p.x, p.y, p.vx * dt, p.vy * dt, S("playerRadius"))
	if r.hit_x:
		p.vx *= -0.15
	if r.hit_y:
		p.vy *= -0.15
	p.x = r.x
	p.y = r.y


# Position du joueur humain (prédite par le client) : validée ici.
func apply_client_state(id: String, s: Dictionary) -> void:
	var p: SP = players.get(id)
	if p == null or p.bot_control or mission.ended:
		return
	if s.has("a"):
		p.angle = float(s.a)
	if s.has("l"):
		p.light = bool(s.l) and p.battery > 0
	if s.has("m"):
		p.move_mode = s.m
	if int(s.get("tp", p.tp)) != p.tp or p.hidden != 0 or p.state == "extracted":
		return
	var nx = float(s.x)
	var ny = float(s.y)
	var max_spd = S("ghostSpeed") if p.state == "dead" else (S("crawlSpeed") if p.state == "downed" else S("sprintSpeed"))
	var dx = nx - p.x
	var dy = ny - p.y
	var d = sqrt(dx * dx + dy * dy)
	var allowed = max_spd * 1.6 * 0.1 + 0.3
	if d > allowed:
		dx *= allowed / d
		dy *= allowed / d
	if p.state == "dead":
		p.x = clampf(p.x + dx, 0.5, map.w - 0.5)
		p.y = clampf(p.y + dy, 0.5, map.h - 0.5)
		return
	var r = grid.move_circle(p.x, p.y, dx, dy, S("playerRadius"))
	p.x = r.x
	p.y = r.y


# ------------------------------------------------------------------ BRUIT
func emit_noise(x: float, y: float, loudness: float, type: String, source := "", mimic := false, detune := 0.0, internal := false) -> Dictionary:
	var n = {"id": next_noise_id, "x": x, "y": y, "loudness": loudness * noise_mul, "type": type, "source": source, "mimic": mimic, "detune": detune, "t": time, "internal": internal}
	next_noise_id += 1
	noises.append(n)
	if not internal:
		net_noises.append(n)
		if source != "" and players.has(source):
			players[source].stats.noise += n.loudness
	return n


func perceived(n: Dictionary, x: float, y: float, hearing_mul := 1.0) -> float:
	var d = Vector2(n.x - x, n.y - y).length()
	var raw: float = n.loudness * hearing_mul
	if d > raw + 1.0:
		return 0.0
	return raw - d - grid.sound_obstruction(n.x, n.y, x, y)


# ------------------------------------------------------------------ PERCEPTION
func flashlight_of(p: SP) -> Dictionary:
	var big = p.equipment == "bigLight"
	return {
		"range": S("flashlightRange") * (1.3 if big else 1.0) * float(mods.flashlightRange),
		"fov": S("flashlightFov") * (1.35 if big else 1.0),
		"on": p.light and p.battery > 0 and p.state != "dead" and p.hidden == 0,
	}


func is_lit_by_lamp(x: float, y: float) -> bool:
	if float(mods.ambientLight) <= 0.05:
		return false
	for l in map.lamps:
		if not l.on:
			continue
		if Vector2(l.x - x, l.y - y).length() < l.radius * 0.85 and grid.has_los(l.x, l.y, x, y):
			return true
	for f in flares:
		if Vector2(f.x - x, f.y - y).length() < 5 and grid.has_los(f.x, f.y, x, y):
			return true
	return false


func monster_sees(m, p: SP) -> bool:
	if p.hidden != 0 or p.state == "dead" or p.state == "extracted":
		return false
	var sight = float(m.def.sight)
	if sight <= 0:
		return false
	var rng_v = sight * float(mods.sight) * float(diff.perception)
	var lit: bool = flashlight_of(p).on or bool(mods.reveal) or is_lit_by_lamp(p.x, p.y)
	if not lit:
		rng_v *= 0.45 if p.move_mode == "sneak" else 0.62
	var d = Vector2(p.x - m.x, p.y - m.y).length()
	if d > rng_v:
		return false
	if d > 1.6 and absf(angle_difference(m.angle, atan2(p.y - m.y, p.x - m.x))) > float(m.def.fov):
		return false
	return grid.has_los(m.x, m.y, p.x, p.y)


func in_flashlight(p: SP, x: float, y: float, range_mul := 1.0) -> bool:
	var fl = flashlight_of(p)
	if not fl.on:
		return false
	var d = Vector2(x - p.x, y - p.y).length()
	if d > fl.range * range_mul:
		return false
	if d > 0.6 and absf(angle_difference(p.angle, atan2(y - p.y, x - p.x))) > fl.fov / 2.0 + 0.08:
		return false
	return grid.has_los(p.x, p.y, x, y)


func observed_by(x: float, y: float) -> Array:
	var out = []
	for p in players.values():
		if (p.state != "alive" and p.state != "downed") or p.hidden != 0:
			continue
		var d = Vector2(x - p.x, y - p.y).length()
		if d < S("ambientSight") and grid.has_los(p.x, p.y, x, y):
			out.append(Vector2(p.x, p.y))
			continue
		if in_flashlight(p, x, y):
			out.append(Vector2(p.x, p.y))
			continue
		if mods.reveal and d < 14 and grid.has_los(p.x, p.y, x, y):
			out.append(Vector2(p.x, p.y))
	for f in flares:
		if Vector2(f.x - x, f.y - y).length() < 5 and grid.has_los(f.x, f.y, x, y):
			out.append(Vector2(f.x, f.y))
	return out


func player_sees(p: SP, m) -> bool:
	if p.state == "dead" or p.hidden != 0:
		return false
	var d = Vector2(m.x - p.x, m.y - p.y).length()
	if d < 2.2:
		return grid.has_los(p.x, p.y, m.x, m.y)
	if in_flashlight(p, m.x, m.y):
		return true
	if d < 12 and (is_lit_by_lamp(m.x, m.y) or m.type == "inspecteur" or m.type == "sauveteur"):
		return grid.has_los(p.x, p.y, m.x, m.y)
	return false


# ------------------------------------------------------------------ OBJETS
func create_item(type: String, x: float, y: float, secret := false) -> SimEntities.SimItem:
	var db: Dictionary = Data.db.ITEMS
	var it = SI.new()
	it.id = "i%d" % next_item_id
	next_item_id += 1
	it.type = type if db.has(type) else "junk"
	it.def = db[it.type]
	it.x = x
	it.y = y
	it.base_value = round(rng.range_f(float(it.def.value[0]), float(it.def.value[1])))
	it.value = it.base_value
	it.secret = secret
	items[it.id] = it
	return it


func update_items(dt: float) -> void:
	var list: Array = items.values()
	var friction_k: float = 3.2 * (0.08 if mods.floatItems else float(mods.friction))
	for it in list:
		if it.carried_by != "":
			it.vx = 0.0
			it.vy = 0.0
			continue
		if it.fall_t > 0:
			it.fall_t -= dt
			if it.fall_t <= 0:
				emit_noise(it.x, it.y, 4 + 2 * float(it.def.loud), "impact", it.id)
				damage_item(it, 3.5)
			continue
		if mods.floatItems:
			it.vx += rng.range_f(-1, 1) * 1.6 * dt
			it.vy += rng.range_f(-1, 1) * 1.6 * dt
		var spd = Vector2(it.vx, it.vy).length()
		if spd < 0.02:
			it.vx = 0.0
			it.vy = 0.0
			continue
		var r = grid.move_circle(it.x, it.y, it.vx * dt, it.vy * dt, it.radius())
		if r.hit_x or r.hit_y:
			var impact = (absf(it.vx) if r.hit_x else 0.0) + (absf(it.vy) if r.hit_y else 0.0)
			if r.hit_x:
				it.vx *= -0.4
			if r.hit_y:
				it.vy *= -0.4
			if impact > 2.0:
				emit_noise(it.x, it.y, minf(14.0, impact * 1.3 * float(it.def.loud)), "impact", it.last_touch if it.last_touch != "" else it.id)
				damage_item(it, impact)
				if impact > 4.5 and it.weight() >= 3:
					var ax = signf(it.vx) if it.vx != 0 else 1.0
					var ay = signf(it.vy) if it.vy != 0 else 1.0
					for c in [[int(floor(r.x + ax * (it.radius() + 0.3))), int(floor(r.y))], [int(floor(r.x)), int(floor(r.y + ay * (it.radius() + 0.3)))]]:
						if grid.get_t(c[0], c[1]) == Grid.CRACKED:
							break_wall(c[0], c[1], it.last_touch)
		it.x = r.x
		it.y = r.y
		var decay = exp(-friction_k * dt)
		it.vx *= decay
		it.vy *= decay
	# collisions entre objets
	for i in list.size():
		var a: SI = list[i]
		if a.carried_by != "" or a.fall_t > 0 or not items.has(a.id):
			continue
		for j in range(i + 1, list.size()):
			var b: SI = list[j]
			if b.carried_by != "" or b.fall_t > 0 or not items.has(b.id):
				continue
			var mn = a.radius() + b.radius()
			var dx = b.x - a.x
			var dy = b.y - a.y
			var d2 = dx * dx + dy * dy
			if d2 >= mn * mn or d2 < 1e-8:
				continue
			var d = sqrt(d2)
			var nx = dx / d
			var ny = dy / d
			var overlap = (mn - d) / 2.0
			a.x -= nx * overlap
			a.y -= ny * overlap
			b.x += nx * overlap
			b.y += ny * overlap
			var rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny
			if rel > 0:
				var ma = a.weight()
				var mb = b.weight()
				var imp = (1.6 * rel) / (ma + mb)
				a.vx -= imp * mb * nx
				a.vy -= imp * mb * ny
				b.vx += imp * ma * nx
				b.vy += imp * ma * ny
				if rel > 3:
					emit_noise((a.x + b.x) / 2.0, (a.y + b.y) / 2.0, minf(10.0, rel * 1.1), "impact", a.last_touch if a.last_touch != "" else b.last_touch)
					damage_item(a, rel * 0.8)
					damage_item(b, rel * 0.8)
	# objets lancés sur les créatures
	for it in list:
		if it.carried_by != "" or it.thrown_by == "" or time - it.thrown_t > 1.5 or not items.has(it.id):
			continue
		if Vector2(it.vx, it.vy).length() < 3:
			continue
		for m in monsters:
			if Vector2(m.x - it.x, m.y - it.y).length() < m.radius + it.radius() + 0.05:
				it.vx *= -0.3
				it.vy *= -0.3
				emit_noise(it.x, it.y, 6, "impact", it.thrown_by)
				if m.type != "demenageur":
					m.stun_t = maxf(m.stun_t, 0.5 + it.weight() * 0.35)
				m.behavior.on_hit_by_item(m)
				emit_sfx("thud", m.x, m.y)
				it.thrown_by = ""
				flags["hitMonster"] = true


func damage_item(it: SI, impact: float) -> void:
	var fr = float(it.def.fragile)
	if fr <= 0 or impact < 2.2 or it.def.get("quest", false):
		return
	var loss = it.base_value * fr * minf(0.4, (impact - 2.0) / 10.0)
	it.value = maxf(0.0, it.value - loss)
	if it.value < it.base_value * 0.12:
		break_item(it)


func break_item(it: SI) -> void:
	items.erase(it.id)
	emit_noise(it.x, it.y, 7 + float(it.def.loud) * 2, "break", it.last_touch if it.last_touch != "" else it.id)
	emit_sfx("break", it.x, it.y)
	var culprit: SP = players.get(it.last_touch)
	if culprit:
		culprit.stats.catastrophes += 1
		culprit.stats.broken += it.base_value
	if it.base_value >= 80:
		highlight("break", "%s a cassé %s (%d cr)" % [culprit.name if culprit else "Quelqu'un", it.def.name, it.base_value])
		signal_event("itemBroken", {"x": it.x, "y": it.y, "value": it.base_value})


# ------------------------------------------------------------------ ACTIONS
func interact(p: SP) -> void:
	if mission.ended:
		return
	if p.state == "dead":
		boo(p)
		return
	if p.state != "alive":
		return
	if p.hidden != 0:
		exit_locker(p)
		return
	p.holding = true
	var rng_i = S("interactRange")
	for o in players.values():
		if o != p and o.state == "downed" and Vector2(o.x - p.x, o.y - p.y).length() < rng_i:
			p.channel = {"kind": "revive", "target": o.id, "t": 0.0}
			return
	var lv: Dictionary = map.lever
	if Vector2(lv.x - p.x, lv.y - p.y).length() < rng_i:
		if mission.deposited >= mission.quota and not mission.departing:
			p.channel = {"kind": "lever", "t": 0.0}
			return
		if not mission.departing:
			private_msg(p, "Quota non atteint : %d / %d cr" % [mission.deposited, mission.quota])
	for e in map.elevators:
		if Vector2(e.x - p.x, e.y - p.y).length() < 0.9 and p.elevator_cd <= 0:
			use_elevator(p, e)
			return
	if p.carry != "":
		drop_carried(p, {})
		return
	var best: SI = null
	var bs = INF
	for it in items.values():
		if it.fall_t > 0:
			continue
		var d = Vector2(it.x - p.x, it.y - p.y).length()
		if d > rng_i + it.radius():
			continue
		if it.carried_by != "" and (it.weight() < 3 or it.helper != "" or not players.has(it.carried_by)):
			continue
		var facing = absf(angle_difference(p.angle, atan2(it.y - p.y, it.x - p.x)))
		var sc = d + (0.5 if facing > 1.2 else 0.0)
		if sc < bs:
			bs = sc
			best = it
	if best:
		grab_item(p, best)
		return
	var door = nearest_door(p.x, p.y, rng_i + 0.3)
	if door != null:
		set_door(door.x, door.y, grid.door_open[door.i] == 0, p.id, 6.0 if p.move_mode == "sprint" else 2.5)
		return
	for l in map.lockers:
		if Vector2(l.x - p.x, l.y - p.y).length() < rng_i:
			enter_locker(p, l)
			return


func release(p: SP) -> void:
	p.holding = false
	p.channel = {}


func nearest_door(x: float, y: float, rng_max: float):
	var best = null
	var bd = rng_max
	for i in map.doors:
		if grid.door_broken[i] == 1:
			continue
		var d = Vector2(x - (i % grid.w + 0.5), y - (i / grid.w + 0.5)).length()
		if d < bd:
			bd = d
			best = {"i": i, "x": i % grid.w, "y": i / grid.w}
	return best


func bump_door(p: SP, tx: int, ty: int) -> void:
	if p.state != "alive" or grid.get_t(tx, ty) != Grid.DOOR or grid.door_open[grid.idx(tx, ty)] == 1:
		return
	if Vector2(p.x - tx - 0.5, p.y - ty - 0.5).length() > 1.4:
		return
	set_door(tx, ty, true, p.id, 6.0 if p.speed > S("walkSpeed") * 1.1 else 2.5)


func set_door(tx: int, ty: int, open: bool, source_id: String, loud := 2.5) -> void:
	var i = grid.idx(tx, ty)
	if grid.get_t(tx, ty) != Grid.DOOR or grid.door_broken[i] == 1:
		return
	if (grid.door_open[i] == 1) == open:
		return
	if not open:
		for p in players.values():
			if p.state != "dead" and absf(p.x - tx - 0.5) < 0.9 and absf(p.y - ty - 0.5) < 0.9:
				return
		for m in monsters:
			if absf(m.x - tx - 0.5) < 0.95 and absf(m.y - ty - 0.5) < 0.95:
				return
		for it in items.values():
			if it.carried_by == "" and int(floor(it.x)) == tx and int(floor(it.y)) == ty:
				return
	grid.door_open[i] = 1 if open else 0
	if loud > 0:
		emit_noise(tx + 0.5, ty + 0.5, loud, "door", source_id)


func break_door(tx: int, ty: int, src_id := "") -> void:
	var i = grid.idx(tx, ty)
	if grid.get_t(tx, ty) != Grid.DOOR or grid.door_broken[i] == 1:
		return
	grid.door_open[i] = 1
	grid.door_broken[i] = 1
	emit_noise(tx + 0.5, ty + 0.5, 10, "door_smash", src_id)
	emit_sfx("smash", tx + 0.5, ty + 0.5)


func break_wall(tx: int, ty: int, src_id := "") -> void:
	if grid.get_t(tx, ty) != Grid.CRACKED:
		return
	grid.set_t(tx, ty, Grid.FLOOR)
	tile_changes.append([grid.idx(tx, ty), Grid.FLOOR])
	for d in [[1, 0], [-1, 0], [0, 1], [0, -1]]:
		if grid.get_t(tx + d[0], ty + d[1]) == Grid.CRACKED:
			break_wall(tx + d[0], ty + d[1], src_id)
	if not flags.has("secretOpened"):
		flags["secretOpened"] = true
		emit_noise(tx + 0.5, ty + 0.5, 13, "wall_break", src_id)
		emit_sfx("wallbreak", tx + 0.5, ty + 0.5)
		announce("Un mur s'est effondré… une pièce secrète !", "secret")
		highlight("secret", "Pièce secrète découverte !")


func grab_item(p: SP, it: SI) -> void:
	if p.carry != "" or p.state != "alive":
		return
	if it.carried_by != "":
		var carrier: SP = players.get(it.carried_by)
		if carrier and it.weight() >= 3 and it.helper == "" and carrier != p:
			it.helper = p.id
			private_msg(p, "Vous aidez %s à porter : %s" % [carrier.name, it.def.name])
		return
	it.carried_by = p.id
	it.helper = ""
	it.vx = 0.0
	it.vy = 0.0
	it.last_touch = p.id
	it.fall_t = 0.0
	p.carry = it.id
	emit_noise(it.x, it.y, 1.2 + it.weight() * 0.5, "impact", p.id)


func drop_carried(p: SP, opts: Dictionary) -> void:
	var it: SI = items.get(p.carry) if p.carry != "" else null
	p.carry = ""
	if it == null:
		return
	it.carried_by = ""
	it.helper = ""
	it.last_dropped_by = p.id
	var a = p.angle
	var pos = grid.unstick(p.x + cos(a) * 0.5, p.y + sin(a) * 0.5, it.radius())
	it.x = pos.x
	it.y = pos.y
	var fling: float = opts.get("fling", 0.0)
	if fling > 0:
		var fa = a + rng.range_f(-1.2, 1.2)
		it.vx = cos(fa) * fling
		it.vy = sin(fa) * fling
	else:
		it.vx = p.vx * 0.5
		it.vy = p.vy * 0.5
		emit_noise(it.x, it.y, 1 + it.weight() * 0.8 * float(it.def.loud), "impact", p.id)
	it.last_touch = p.id


func throw_item(p: SP) -> void:
	if p.state != "alive" or p.carry == "":
		return
	var it: SI = items.get(p.carry)
	drop_carried(p, {"reason": "throw"})
	if it == null:
		return
	var spd = 9.5 / sqrt(float(it.weight()))
	it.vx = cos(p.angle) * spd + p.vx * 0.5
	it.vy = sin(p.angle) * spd + p.vy * 0.5
	it.thrown_by = p.id
	it.thrown_t = time
	emit_noise(p.x, p.y, 2, "impact", p.id)


func use_utility(p: SP) -> void:
	if p.state != "alive" or p.hidden != 0:
		return
	if p.equipment == "decoy" and p.charges > 0:
		p.charges -= 1
		var it = create_item("decoy", p.x + cos(p.angle) * 0.5, p.y + sin(p.angle) * 0.5)
		it.vx = cos(p.angle) * 10
		it.vy = sin(p.angle) * 10
		it.decoy_t = 3.2
		it.last_touch = p.id
		it.thrown_by = p.id
		it.thrown_t = time
		var pos = grid.unstick(it.x, it.y, it.radius())
		it.x = pos.x
		it.y = pos.y
	elif p.equipment == "flare" and p.charges > 0:
		p.charges -= 1
		var f = create_item("decoy", p.x, p.y)
		f.vx = cos(p.angle) * 8
		f.vy = sin(p.angle) * 8
		f.flare_t = 12.0
		f.is_flare = true
		f.last_touch = p.id
	elif p.equipment == "medkit" and p.charges > 0 and p.hp < int(S("maxHp")):
		p.charges -= 1
		p.hp = mini(int(S("maxHp")), p.hp + 1)
		emit_sfx("heal", p.x, p.y)
		private_msg(p, "Soigné (+1 PV)")


func enter_locker(p: SP, l: Dictionary) -> void:
	if p.state != "alive" or p.hidden != 0:
		return
	var occ = locker_occupants(int(l.id))
	if occ.size() >= 2:
		private_msg(p, "Casier plein !")
		return
	if p.carry != "":
		drop_carried(p, {})
	p.hidden = int(l.id)
	p.x = l.x
	p.y = l.y
	p.vx = 0.0
	p.vy = 0.0
	p.tp += 1
	p.channel = {}
	emit_noise(l.x, l.y, 2.2, "locker", p.id)
	if occ.size() == 1:
		announce("%s et %s partagent un casier. C'est étroit." % [occ[0].name, p.name], "funny")
		highlight("locker", "%s et %s cachés dans le même casier" % [occ[0].name, p.name])


func exit_locker(p: SP) -> void:
	for l in map.lockers:
		if int(l.id) == p.hidden:
			var pos = grid.unstick(l.x + cos(l.face) * 0.6, l.y + sin(l.face) * 0.6, S("playerRadius"))
			p.x = pos.x
			p.y = pos.y
			emit_noise(l.x, l.y, 2.2, "locker", p.id)
	p.hidden = 0
	p.tp += 1


func use_elevator(p: SP, el: Dictionary) -> void:
	var dest = null
	if mods.elevatorRandom:
		var rooms = (map.rooms as Array).filter(func(r): return not r.secret)
		dest = random_point_in_room(rng.pick(rooms))
		private_msg(p, "Le monte-charge vous a déposé… quelque part.")
	else:
		var other: Dictionary = map.elevators[int(el.pair)]
		dest = Vector2(other.x, other.y)
	if dest == null:
		return
	emit_noise(el.x, el.y, 5, "elevator", p.id)
	var pos = grid.unstick(dest.x, dest.y + 0.01, S("playerRadius"))
	p.x = pos.x
	p.y = pos.y
	p.vx = 0.0
	p.vy = 0.0
	p.tp += 1
	p.elevator_cd = 3.0
	if p.carry != "" and items.has(p.carry):
		items[p.carry].helper = ""
	emit_noise(p.x, p.y, 5, "elevator", p.id)
	emit_sfx("ding", p.x, p.y)


func boo(p: SP) -> void:
	if p.state != "dead" or p.boo_cd > 0:
		return
	p.boo_cd = 5.0
	p.stats.boos += 1
	emit_noise(p.x, p.y, 3.5, "boo", p.id)
	out_msgs.append({"k": "bubble", "id": p.id, "text": "Bouh !", "kind": "ghost"})


func emote(p: SP, id: String, text: String) -> void:
	p.emote = text
	p.emote_until = time + 2.5
	void_id(id)


func void_id(_id) -> void:
	pass


func set_voice(p: SP, level: float, radio: bool) -> void:
	p.voice_level = clampf(level, 0, 1)
	p.voice_t = time
	p.radio_tx = radio and p.equipment == "radio" and p.radio_battery > 0 and not mods.radioDisabled


func chat(p: SP, text: String) -> void:
	var t = text.substr(0, 140).strip_edges()
	if t == "":
		return
	out_msgs.append({"k": "chat", "id": p.id, "name": p.name, "text": t, "dead": p.state == "dead"})
	if p.state == "alive":
		emit_noise(p.x, p.y, 2, "chat", p.id)


func bot_speak(p: SP, text: String, loud := "talk") -> void:
	out_msgs.append({"k": "bubble", "id": p.id, "text": text, "kind": "bot"})
	if p.state == "dead":
		return
	emit_noise(p.x, p.y, (11.0 if loud == "scream" else 5.0) * float(mods.voiceNoise), "scream" if loud == "scream" else "voice", p.id)


func say(m, text: String, kind: String) -> void:
	out_msgs.append({"k": "bubble", "id": m.id, "text": text, "kind": kind, "x": m.x, "y": m.y})


func emit_sfx(sfx_name: String, x: float, y: float) -> void:
	out_msgs.append({"k": "sfx", "name": sfx_name, "x": x, "y": y})


func announce(text: String, kind := "info", extra := {}) -> void:
	var m = {"k": "announce", "text": text, "kind": kind}
	m.merge(extra)
	out_msgs.append(m)


func private_msg(p: SP, text: String) -> void:
	out_msgs.append({"k": "private", "to": p.id, "text": text})


func ping(x: float, y: float, label: String, dur: float) -> void:
	pings.append({"x": x, "y": y, "label": label, "until": time + dur})


func shake(x: float, y: float, amp: float) -> void:
	out_msgs.append({"k": "shake", "x": x, "y": y, "amp": amp})


func flag(n: String) -> void:
	flags[n] = true


func signal_event(n: String, data: Dictionary) -> void:
	if n == "inspectorControl" or n == "monsterExposed":
		mission.alerts += 1
	director.signal_event(n, data)


func highlight(kind: String, text: String) -> void:
	highlights.append({"t": int(time), "kind": kind, "text": text})
	out_msgs.append({"k": "highlight", "text": text})


func knockback(p: SP, angle: float, force: float) -> void:
	p.kb = [p.kb[0] + 1, cos(angle) * force, sin(angle) * force]
	if p.bot_control:
		p.vx += cos(angle) * force
		p.vy += sin(angle) * force


func damage_player(p: SP, dmg: int, src, opts := {}) -> void:
	if p.state != "alive" or p.invuln_t > 0 or mission.ended:
		return
	var carried: SI = items.get(p.carry) if p.carry != "" else null
	p.last_hit = {"monsterType": src.type if src else "", "t": time, "carriedValue": carried.value if carried else -1.0, "carriedName": carried.def.name if carried else ""}
	p.hp -= dmg
	p.invuln_t = 1.4
	p.hurt_t = 1.5
	p.stats.hits += 1
	var a: float = opts.get("dir", atan2(p.y - src.y, p.x - src.x) if src else 0.0)
	knockback(p, a, opts.get("knock", 5.0))
	if p.carry != "":
		drop_carried(p, {"fling": 3.0})
	emit_sfx("hit", p.x, p.y)
	emit_noise(p.x, p.y, 8, "scream", p.id)
	if p.bot_control:
		chatter.say(p, "hurt", {}, {"force": true})
	if p.hp <= 0:
		down_player(p)


func down_player(p: SP) -> void:
	p.state = "downed"
	p.hp = 0
	p.down_t = S("bleedOutTime")
	p.channel = {}
	p.holding = false
	if p.hidden != 0:
		exit_locker(p)
	p.downed_near = []
	for o in players.values():
		if o != p and o.state == "alive" and Vector2(o.x - p.x, o.y - p.y).length() < 10:
			p.downed_near.append(o.id)
	announce("%s est à terre !" % p.name, "down", {"player": p.id})
	for o in players.values():
		if o != p and o.brain and o.state == "alive":
			o.brain.decide_t = 0.0


func kill_player(p: SP, cause: String) -> void:
	if p.state == "dead":
		return
	var c = SimStats.death_cause(self, p, cause)
	p.stats.deathCause = c.text
	p.stats.absurd = c.absurd
	p.stats.deaths += 1
	p.state = "dead"
	p.hidden = 0
	p.carry = ""
	p.channel = {}
	p.light = false
	for id in p.downed_near:
		var o: SP = players.get(id)
		if o and o.state == "alive" and Vector2(o.x - p.x, o.y - p.y).length() > 14:
			o.stats.abandons += 1
	announce("%s est mort. %s." % [p.name, c.text], "death", {"player": p.id})
	highlight("death", "%s : %s" % [p.name, c.text])


func revive(p: SP, by: SP) -> void:
	var last_second = p.down_t < 3
	p.state = "alive"
	p.hp = 1
	p.invuln_t = 2.0
	p.down_t = 0.0
	by.stats.revives += 1
	if last_second:
		by.stats.lastSecond = true
		highlight("save", "%s relève %s à la dernière seconde !" % [by.name, p.name])
	announce("%s a relevé %s !" % [by.name, p.name], "revive")
	if p.brain:
		chatter.say(p, "revived", {}, {"force": true})


func confiscate(m, p: SP, it: SI) -> void:
	drop_carried(p, {"reason": "confiscated"})
	it.carried_by = m.id
	it.vx = 0.0
	it.vy = 0.0
	p.stats.confiscated += 1
	highlight("confiscate", "L'Inspecteur a confisqué %s à %s" % [it.def.name, p.name])


func release_item(it: SI, x: float, y: float) -> void:
	it.carried_by = ""
	var pos = grid.unstick(x, y, it.radius())
	it.x = pos.x
	it.y = pos.y


func spawn_item(type: String, x: float, y: float) -> SimEntities.SimItem:
	return create_item(type, x, y)


# ------------------------------------------------------------------ BOUCLE
func step(dt: float) -> void:
	if mission.ended:
		return
	time += dt
	while noises.size() > 0 and noises[0].t < time - dt * 1.5:
		noises.pop_front()
	for p in players.values():
		update_player(p, dt)
	update_carried(dt)
	update_items(dt)
	update_gadgets(dt)
	update_mission(dt)
	spawner.update()
	if mods.aggro or mission.departing:
		aggro_pulse(dt)
	for m in monsters:
		m.update(dt)
	director.update(dt)
	pings = pings.filter(func(pg): return pg.until > time)


func update_player(p: SP, dt: float) -> void:
	p.invuln_t = maxf(0, p.invuln_t - dt)
	p.hurt_t = maxf(0, p.hurt_t - dt)
	p.flicker_t = maxf(0, p.flicker_t - dt)
	p.elevator_cd = maxf(0, p.elevator_cd - dt)
	p.boo_cd = maxf(0, p.boo_cd - dt)
	if p.emote != "" and p.emote_until < time:
		p.emote = ""
	if p.state == "extracted":
		return
	if p.bot_control and p.brain:
		p.brain.update(dt)
		if p.hidden == 0:
			step_movement(p, p.brain.input_mx, p.brain.input_my, p.brain.input_mode, player_env(p), dt)
			p.move_mode = p.brain.input_mode
	var moved = Vector2(p.x - p.px, p.y - p.py).length()
	if moved > 2.5:
		moved = 0.0
	p.px = p.x
	p.py = p.y
	p.speed = p.speed * 0.6 + (moved / dt) * 0.4
	var iv = in_van(p.x, p.y)
	if iv and not p.was_in_van:
		p.entered_van_t = time
	p.was_in_van = iv
	if p.state == "downed":
		p.down_t -= dt
		if p.down_t <= 0:
			kill_player(p, "bleed")
		return
	if p.state == "dead":
		return
	var sprinting = p.speed > S("walkSpeed") * 1.15
	p.stamina = clampf(p.stamina + (-S("staminaDrain") if sprinting else S("staminaRegen")) * dt, 0, 1)
	if p.light:
		p.battery = maxf(0, p.battery - S("batteryDrain") * (2.0 if p.equipment == "bigLight" else 1.0) * dt)
		if p.battery <= 0:
			p.light = false
	else:
		p.battery = minf(1, p.battery + S("batteryRegen") * dt)
	if p.hidden == 0 and moved > 0.001:
		p.step_acc += moved
		var stride = 0.85 if sprinting else 0.6
		if p.step_acc >= stride:
			p.step_acc = 0.0
			var t = grid.get_t(int(floor(p.x)), int(floor(p.y)))
			var loud = 0.9 if p.speed < S("sneakSpeed") * 1.2 else (5.5 if sprinting else 2.6)
			if p.equipment == "sneakers":
				loud *= 0.6
			var type = "step"
			if t == Grid.DEBRIS:
				loud = maxf(3.2, loud * 2.2)
				type = "step_debris"
			elif t == Grid.GRATE:
				loud = maxf(2.2, loud * 1.6)
				type = "step_grate"
			if p.carry != "" and items.has(p.carry) and items[p.carry].weight() >= 3:
				loud += 1
			emit_noise(p.x, p.y, loud, type, p.id)
	if time - p.voice_t > 0.6:
		p.voice_level = 0.0
		p.radio_tx = false
	if p.voice_level > 0.015 and not p.is_bot:
		p.voice_acc += dt
		if p.voice_acc > 0.25:
			p.voice_acc = 0.0
			var vl = (1.5 + p.voice_level * 14.0) * float(mods.voiceNoise) * (0.6 if p.hidden != 0 else 1.0)
			emit_noise(p.x, p.y, vl, "scream" if p.voice_level > 0.6 else "voice", p.id)
			if p.radio_tx:
				p.radio_battery = maxf(0, p.radio_battery - 0.0125)
				for o in players.values():
					if o != p and o.state != "dead" and o.equipment == "radio" and o.radio_battery > 0:
						emit_noise(o.x, o.y, 3.5, "radio", o.id)
	var chased = false
	for m in monsters:
		if m.target == p.id and m.state in ["chase", "charge", "lunge", "stalk"] and Vector2(m.x - p.x, m.y - p.y).length() < 12:
			chased = true
	if chased:
		p.stats.chaseT += dt
	else:
		if p.stats.chaseT > p.stats.longestChase:
			p.stats.longestChase = p.stats.chaseT
		p.stats.chaseT = 0.0
	if not p.channel.is_empty():
		var ch: Dictionary = p.channel
		if ch.kind == "revive":
			var o: SP = players.get(ch.target)
			if o == null or o.state != "downed" or Vector2(o.x - p.x, o.y - p.y).length() > S("interactRange") + 0.4:
				p.channel = {}
			else:
				ch.t += dt * (2.0 if p.equipment == "medkit" else 1.0)
				if ch.t >= S("reviveTime"):
					revive(o, p)
					p.channel = {}
		elif ch.kind == "lever":
			if Vector2(map.lever.x - p.x, map.lever.y - p.y).length() > S("interactRange") + 0.4 or mission.departing:
				p.channel = {}
			else:
				ch.t += dt
				if ch.t >= S("leverTime"):
					start_departure(p)
					p.channel = {}


func update_carried(dt: float) -> void:
	for it in items.values():
		if it.carried_by == "":
			continue
		if players.has(it.carried_by):
			var p: SP = players[it.carried_by]
			if p.state != "alive" or p.carry != it.id:
				it.carried_by = ""
				if p.carry == it.id:
					p.carry = ""
				continue
			var off = S("playerRadius") + it.radius() + 0.05
			var tx = p.x + cos(p.angle) * off
			var ty = p.y + sin(p.angle) * off
			if not grid.collides(tx, ty, it.radius() * 0.8):
				it.x = tx
				it.y = ty
			else:
				it.x = p.x
				it.y = p.y
			if it.helper != "":
				var hh: SP = players.get(it.helper)
				if hh == null or hh.state != "alive" or hh.carry != "" or Vector2(hh.x - it.x, hh.y - it.y).length() > 1.9:
					it.helper = ""
			if it.def.get("squeak", false):
				it.squeak_t -= dt
				if it.squeak_t <= 0 and p.speed > 0.3:
					it.squeak_t = 1.1
					emit_noise(it.x, it.y, 3.5, "squeak", p.id)
		else:
			var mon = null
			for m in monsters:
				if m.id == it.carried_by:
					mon = m
			if mon == null:
				it.carried_by = ""
				continue
			it.x = mon.x + cos(mon.angle) * 0.5
			it.y = mon.y + sin(mon.angle) * 0.5
	for p in players.values():
		if p.state != "alive" or p.hidden != 0:
			continue
		for it in items.values():
			if it.carried_by != "" or it.fall_t > 0:
				continue
			var mn = S("playerRadius") + it.radius()
			var dx: float = it.x - p.x
			var dy: float = it.y - p.y
			var d2 = dx * dx + dy * dy
			if d2 < mn * mn and d2 > 1e-6:
				var d = sqrt(d2)
				var push = (mn - d) / maxf(1.0, it.weight() * 0.7)
				it.x += dx / d * push
				it.y += dy / d * push
				var sp = Vector2(p.vx, p.vy).length()
				if sp < 0.01:
					sp = p.speed
				if sp > S("walkSpeed") * 1.2 and it.weight() <= 2:
					it.vx += dx / d * sp * 0.9
					it.vy += dy / d * sp * 0.9
					it.last_touch = p.id
				if grid.collides(it.x, it.y, it.radius()):
					var fixed = grid.unstick(it.x, it.y, it.radius())
					it.x = fixed.x
					it.y = fixed.y


func update_gadgets(dt: float) -> void:
	for it in items.values():
		if it.decoy_t > 0 and Vector2(it.vx, it.vy).length() < 1.5:
			it.decoy_t -= dt
			if it.decoy_t <= 0:
				it.decoy_pulses = 4
				it.decoy_pulse_t = 0.0
		if it.decoy_pulses > 0:
			it.decoy_pulse_t -= dt
			if it.decoy_pulse_t <= 0:
				it.decoy_pulse_t = 0.8
				it.decoy_pulses -= 1
				emit_noise(it.x, it.y, 15, "decoy", it.id)
				if it.decoy_pulses == 0:
					items.erase(it.id)
		if it.is_flare:
			it.flare_t -= dt
			it.flare_noise_t -= dt
			if it.flare_noise_t <= 0:
				it.flare_noise_t = 1.0
				emit_noise(it.x, it.y, 4, "flare", it.id)
			if it.flare_t <= 0:
				items.erase(it.id)
	flares = []
	for it in items.values():
		if it.is_flare:
			flares.append({"x": it.x, "y": it.y})


func aggro_pulse(dt: float) -> void:
	aggro_t -= dt
	if aggro_t > 0:
		return
	aggro_t = 3.0
	for p in alive_players():
		if p.hidden != 0:
			continue
		emit_noise(p.x, p.y, 7.0 if mission.departing and not mods.aggro else 14.0, "step", p.id, false, 0.0, true)


# ------------------------------------------------------------------ MISSION
func update_mission(dt: float) -> void:
	var m = mission
	for it in items.values():
		if it.carried_by != "" or it.fall_t > 0 or it.def.get("noLoot", false):
			continue
		if in_van(it.x, it.y) and Vector2(it.vx, it.vy).length() < 1.2:
			it.in_van_t += dt
			if it.in_van_t > 0.6:
				deposit_item(it)
				continue
		else:
			it.in_van_t = 0.0
		if quest != null and not quest.done and it.id == quest.item and Vector2(it.x - quest.x, it.y - quest.y).length() < quest.r:
			quest.done = true
			m.bonus += quest.reward
			items.erase(it.id)
			announce("CONTRÔLE QUALITÉ VALIDÉ ! +%d cr" % quest.reward, "success")
			emit_sfx("quack", it.x, it.y)
	if not m.quotaReachedSignaled and m.deposited >= m.quota:
		m.quotaReachedSignaled = true
		announce("QUOTA ATTEINT ! Tirez le levier du fourgon pour partir… ou continuez (prime au-delà du quota).", "success")
		signal_event("quotaReached", {})
	if customer != null and customer.until < time:
		customer = null
	if not m.departing:
		m.timeLeft -= dt
		if m.timeLeft <= 0 and not m.aggro:
			m.aggro = true
			m.timeLeft = 0.0
			announce("HEURE DE FERMETURE ! Toutes les créatures chassent. Le fourgon démarre !", "danger")
			director.recompute()
			start_departure(null)
	else:
		m.departT -= dt
		m.engineT -= dt
		if m.engineT <= 0:
			m.engineT = 2.0
			var v: Dictionary = map.van
			emit_noise(v.x + v.w / 2.0, v.y + v.h / 2.0, 16, "engine", "van")
		if m.departT <= 0:
			finish("departure")
	var standing = false
	for p in players.values():
		if p.state == "alive":
			standing = true
	m.wipeT = 0.0 if standing else m.wipeT + dt
	if m.wipeT > 4:
		finish("wipe")


func deposit_item(it: SI) -> void:
	var value: float = it.value * float(mods.valueMul)
	if customer != null and not customer.done and it.type == customer.type:
		value *= 2
		customer.done = true
		announce("Le client est ravi ! %s payé DOUBLE." % it.def.name, "success")
	mission.deposited += value
	items.erase(it.id)
	var p: SP = players.get(it.last_touch)
	var fragile_intact: bool = float(it.def.fragile) >= 0.6 and it.value >= it.base_value * 0.9
	if p:
		p.stats.deposited += value
		p.stats.depositedCount += 1
		if fragile_intact:
			p.stats.fragileIntact += 1
		if it.weight() >= 3:
			p.stats.heavyExtracted += 1
	extracted.append({"type": it.type, "value": round(value), "fragileIntact": fragile_intact, "heavy": it.weight() >= 4})
	emit_sfx("kaching", it.x, it.y)
	emit_noise(it.x, it.y, 3, "kaching", it.last_touch)
	if it.type == "golden_gnome":
		highlight("gnome", "Le NAIN DE JARDIN DORÉ est dans le fourgon !")


func start_departure(by) -> void:
	if mission.departing:
		return
	mission.departing = true
	mission.departT = S("departureTime")
	mission.engineT = 0.0
	announce("%sLE FOURGON PART DANS %d SECONDES !" % [(by.name + " a tiré le levier. ") if by else "", int(S("departureTime"))], "danger")
	emit_sfx("engine_start", map.van.x, map.van.y)


func finish(reason: String) -> void:
	if mission.ended:
		return
	mission.ended = true
	mission.endReason = reason
	if reason == "departure":
		for p in players.values():
			if p.state == "dead":
				continue
			if in_van(p.x, p.y):
				if time - p.entered_van_t < 1.5:
					p.stats.lastSecond = true
					highlight("last_second", "%s saute dans le fourgon à la dernière seconde !" % p.name)
				p.state = "extracted"
			else:
				kill_player(p, "left")
		mission.success = mission.deposited >= mission.quota
	else:
		mission.success = false
	for it in items.values():
		var p: SP = players.get(it.last_dropped_by)
		if p and not it.def.get("noLoot", false) and not it.def.get("quest", false):
			p.stats.abandonedValue += it.value
	result = SimStats.build_result(self)
	out_msgs.append({"k": "end", "reason": reason, "success": mission.success})


func check_side(o: Dictionary) -> bool:
	var m = mission
	match String(o.id):
		"no_death":
			return m.success and players.values().all(func(p): return p.state == "extracted")
		"fragile3":
			return extracted.filter(func(e): return e.fragileIntact).size() >= 3
		"big_haul":
			return m.deposited >= m.quota * 1.5
		"quiet":
			return m.success and m.alerts < 8
		"heavy2":
			return extracted.filter(func(e): return e.heavy).size() >= 2
		"fast":
			return m.success and m.timeLeft > 120
	return false


# ------------------------------------------------------------------ INSTANTANÉ (même format que le serveur)
func snapshot() -> Dictionary:
	var ps = []
	for p in players.values():
		var env = player_env(p)
		var chan = null
		if not p.channel.is_empty():
			var total = S("reviveTime") / (2.0 if p.equipment == "medkit" else 1.0) if p.channel.kind == "revive" else S("leverTime")
			chan = [p.channel.kind, p.channel.t / total]
		ps.append({
			"id": p.id, "x": p.x, "y": p.y, "a": p.angle, "st": p.state, "hp": p.hp, "c": p.carry if p.carry != "" else null, "l": 1 if p.light else 0,
			"b": p.battery, "rb": p.radio_battery, "s": p.stamina, "h": p.hidden if p.hidden != 0 else null, "m": p.move_mode, "v": p.voice_level, "rt": 1 if p.radio_tx else 0,
			"tp": p.tp, "kb": p.kb, "sm": env.speedMul, "fr": env.friction, "ch": p.charges, "eq": p.equipment,
			"bot": 1 if p.bot_control else 0, "dc": 0 if p.connected else 1, "dn": p.down_t if p.state == "downed" else 0.0,
			"chan": chan, "em": p.emote if p.emote != "" else null, "fl": 1 if p.flicker_t > 0 else 0, "hu": 1 if p.hurt_t > 0 else 0, "sp": p.speed,
		})
	var ms = []
	for m in monsters:
		ms.append(m.snapshot())
	var its = []
	for it in items.values():
		its.append({"id": it.id, "k": it.type, "x": it.x, "y": it.y, "c": it.carried_by if it.carried_by != "" else null, "v": round(it.value), "f": it.fall_t if it.fall_t > 0 else 0.0,
			"h": it.helper if it.helper != "" else null, "d": 1 if (it.decoy_pulses > 0 or it.decoy_t > 0) else 0, "fl": 1 if it.is_flare else 0})
	var doors = ""
	for i in map.doors:
		doors += "2" if grid.door_broken[i] == 1 else str(grid.door_open[i])
	var lamps = ""
	for l in map.lamps:
		lamps += "1" if l.on else "0"
	var tiles = tile_changes.duplicate()
	tile_changes.clear()
	var nz = []
	for n in net_noises:
		nz.append({"x": n.x, "y": n.y, "t": n.type, "l": n.loudness, "s": n.source, "mi": 1 if n.mimic else 0, "dt": n.detune})
	net_noises.clear()
	var msgs = out_msgs.duplicate()
	out_msgs.clear()
	var fl = []
	for f in flares:
		fl.append([f.x, f.y])
	return {
		"time": time, "players": ps, "monsters": ms, "items": its, "doors": doors, "lamps": lamps, "tiles": tiles, "noises": nz, "msgs": msgs,
		"ev": director.snapshot(),
		"mods": {"al": mods.ambientLight, "fr": mods.flashlightRange, "fk": mods.flicker, "fx": mods.voiceFx, "cf": mods.confetti, "rv": mods.reveal, "ft": mods.fakeTeammate,
			"rd": mods.radioDisabled, "fz": mods.monsterFreeze, "sg": mods.sight, "ag": mods.aggro, "gv": mods.floatItems, "er": mods.elevatorRandom},
		"mission": {"q": mission.quota, "d": round(mission.deposited), "b": round(mission.bonus), "tl": round(mission.timeLeft), "dep": mission.departT if mission.departing else -1.0,
			"ag": 1 if mission.aggro else 0, "end": 1 if mission.ended else 0},
		"tension": director.tension, "phase": director.phase,
		"fakeVan": fake_van, "quest": quest, "customer": customer, "flares": fl, "pings": pings,
	}


func start_info() -> Dictionary:
	var roster = []
	for p in players.values():
		roster.append({"id": p.id, "name": p.name, "bot": p.is_bot, "botProfile": p.bot_profile, "cosmetics": p.cosmetics, "equipment": p.equipment})
	return {
		"mission": {"id": mission_id, "name": mission_def.name, "brief": mission_def.brief, "difficulty": diff_id, "variant": variant.name, "quota": mission.quota, "time": mission.timeLimit},
		"side": side_objectives, "roster": roster,
	}
