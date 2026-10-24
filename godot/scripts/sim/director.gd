# LE DIRECTEUR — rythme (calme → montée → pic → répit) et événements de chaos.
# Port de shared/sim/events/director.js + mods.js + actions.js (événements pilotés par les données).
class_name SimDirector
extends RefCounted

const MAX_TIMED = 2
const MIN_GAP = 14.0
const MULTIPLY = ["ambientLight", "flashlightRange", "friction", "voiceNoise", "monsterSpeed", "monsterHearing", "sight", "valueMul"]

var game
var defs = {}
var active = []
var pending = []
var cooldowns = {}
var last_event_t = 0.0
var tension = 0.0
var phase = "calm"
var phase_t = 0.0
var history = []
var eval_t = 0.0
var noise_window = []


static func default_mods() -> Dictionary:
	return {
		"ambientLight": 1.0, "flashlightRange": 1.0, "flicker": 0, "friction": 1.0, "floatItems": 0, "voiceNoise": 1.0, "voiceFx": "",
		"monsterSpeed": 1.0, "monsterHearing": 1.0, "monsterFreeze": 0, "radioDisabled": 0, "sight": 1.0, "valueMul": 1.0, "confetti": 0,
		"reveal": 0, "fakeTeammate": 0, "elevatorRandom": 0, "aggro": 0,
	}


func _init(g) -> void:
	game = g
	for d in Data.db.EVENTS:
		defs[d.id] = d


func risk() -> float:
	var m = game.mission
	var t_frac = minf(1.0, game.time / m.timeLimit)
	var q_frac = minf(1.0, m.deposited / maxf(1.0, m.quota))
	return minf(1.0, 0.45 * t_frac + 0.25 * q_frac + 0.3 * minf(1.0, recent_noise() / 400.0))


func recent_noise() -> float:
	var s = 0.0
	for e in noise_window:
		s += e[1]
	return s


func update(dt: float) -> void:
	var g = game
	update_tension(dt)
	for n in g.noises:
		if not n.internal and n.loudness >= 5 and n.t >= g.time - dt * 1.01 and g.players.has(n.source):
			noise_window.append([g.time, n.loudness])
	while noise_window.size() > 0 and noise_window[0][0] < g.time - 20:
		noise_window.pop_front()
	if recent_noise() > 700:
		signal_event("teamTooLoud", {})
	for p in pending.duplicate():
		if g.time >= p.at:
			pending.erase(p)
			begin(p.def, p.signal)
	for inst in active.duplicate():
		if inst.def.has("every") and g.time >= inst.nextTick:
			inst.nextTick = g.time + float(inst.def.every.period)
			run_actions(inst.def.every.actions, inst)
		if g.time >= inst.end:
			finish(inst)
	eval_t -= dt
	if eval_t <= 0:
		eval_t = 1.0
		try_spontaneous()
	recompute()


func update_tension(dt: float) -> void:
	var g = game
	var t = 0.0
	for p in g.players.values():
		if p.state != "alive":
			continue
		for m in g.monsters:
			var d = Vector2(p.x - m.x, p.y - m.y).length()
			var chasing = m.target == p.id and m.state in ["chase", "charge", "lunge", "control", "stalk"]
			if chasing:
				t = maxf(t, 0.6 + 0.4 * maxf(0.0, 1.0 - d / 12.0))
			elif d < 8:
				t = maxf(t, 0.45 * (1.0 - d / 8.0))
		if p.hurt_t > 0:
			t = maxf(t, 0.8)
	if g.mission.departing:
		t = maxf(t, 0.7)
	tension += (t - tension) * minf(1.0, dt * (2.0 if t > tension else 0.25))
	phase_t += dt
	var prev = phase
	if tension > 0.7:
		phase = "peak"
	elif phase == "peak" and tension < 0.5:
		phase = "relax"
	elif phase == "relax" and phase_t > 20:
		phase = "calm"
	elif phase == "calm" and tension > 0.3:
		phase = "build"
	elif phase == "build" and tension < 0.15 and phase_t > 15:
		phase = "calm"
	if prev != phase:
		phase_t = 0.0
	if phase == "peak" and phase_t > 22:
		for m in g.monsters:
			if m.state in ["chase", "stalk"]:
				m.cycle = {"phase": "rest", "t": 15.0}
				m.behavior.on_rest(m)
				break
		phase_t = 10.0


func _live_defs() -> Array:
	var out = []
	for a in active:
		out.append(a.def)
	for p in pending:
		out.append(p.def)
	return out


func eligible(def: Dictionary, force := false) -> bool:
	var g = game
	var m = g.mission
	var c = def.get("conditions", {})
	if not force:
		if cooldowns.get(def.id, 0.0) > g.time:
			return false
		if g.time < float(def.get("minTime", 0)):
			return false
		if float(def.get("minDifficulty", 0)) > float(g.diff.level):
			return false
	for a in active:
		if a.def.id == def.id:
			return false
	for p in pending:
		if p.def.id == def.id:
			return false
	var tags = def.get("tags", [])
	for l in _live_defs():
		for t in l.get("tags", []):
			if t in tags:
				return false
		if l.id in def.get("incompatible", []) or def.id in l.get("incompatible", []):
			return false
	if force:
		return true
	if c.has("minRisk") and risk() < float(c.minRisk):
		return false
	if c.has("maxTension") and tension > float(c.maxTension):
		return false
	if c.has("minTension") and tension < float(c.minTension):
		return false
	var q = m.deposited / maxf(1.0, m.quota)
	if c.has("minQuota") and q < float(c.minQuota):
		return false
	if c.has("maxQuota") and q > float(c.maxQuota):
		return false
	if c.has("theme") and g.map.theme != c.theme:
		return false
	if c.get("needsElevators", false) and g.map.elevators.size() < 2:
		return false
	if c.get("notDeparting", false) and m.departing:
		return false
	if c.has("minTimeLeft") and m.timeLeft < float(c.minTimeLeft):
		return false
	if c.has("minPlayers") and g.alive_players().size() < int(c.minPlayers):
		return false
	if def.duration is Array:
		var timed = 0
		for a in active:
			if a.end > g.time + 0.01:
				timed += 1
		if timed >= MAX_TIMED:
			return false
	return true


func try_spontaneous() -> void:
	var g = game
	if g.time < 25 or g.mission.ended or g.time - last_event_t < MIN_GAP:
		return
	var phase_mul = {"calm": 1.7, "build": 1.0, "peak": 0.25, "relax": 0.5}[phase]
	var since = g.time - last_event_t
	var p = (1.0 / 45.0) * float(g.diff.eventRate) * phase_mul * (0.6 + risk()) * minf(2.0, since / 40.0)
	if not g.rng.chance(p):
		return
	var pool = []
	var weights = []
	for d in defs.values():
		if d.category == "triggered" or not eligible(d):
			continue
		var w = float(d.weight)
		if phase == "peak" and d.category in ["danger", "tension"]:
			w *= 0.1
		if phase == "calm" and d.category in ["danger", "tension"]:
			w *= 1.5
		if d.category == "humor" and phase == "relax":
			w *= 1.6
		if g.map.theme == "hotel" and d.id == "crazy_doors":
			w *= 2.0
		pool.append(d)
		weights.append(w)
	if pool.is_empty():
		return
	var def = g.rng.weighted(pool, weights)
	if def != null:
		schedule(def, {})


func signal_event(sig_name: String, data: Dictionary) -> void:
	var g = game
	for def in defs.values():
		if def.get("trigger", "") != sig_name or not eligible(def):
			continue
		if not g.rng.chance(float(def.get("chance", 1.0))):
			cooldowns[def.id] = g.time + 10.0
			continue
		schedule(def, data)


func schedule(def: Dictionary, sig: Dictionary) -> void:
	var g = game
	last_event_t = g.time
	cooldowns[def.id] = g.time + float(def.get("cooldown", 60))
	var warn = def.get("warn")
	if warn is Dictionary and float(warn.time) > 0:
		g.announce(warn.text, "warn")
		pending.append({"def": def, "at": g.time + float(warn.time), "signal": sig})
	else:
		begin(def, sig)


func force_start(id: String) -> bool:
	var def = defs.get(id)
	if def == null or not eligible(def, true):
		return false
	cooldowns[def.id] = game.time + float(def.get("cooldown", 60))
	begin(def, {})
	return true


func begin(def: Dictionary, sig) -> void:
	var g = game
	var dur = 0.0
	if def.duration is Array:
		dur = g.rng.range_f(float(def.duration[0]), float(def.duration[1]))
	var every_p = float(def.every.period) if def.has("every") else 0.0
	var inst = {"def": def, "start": g.time, "end": g.time + dur, "duration": dur, "nextTick": g.time + every_p, "memory": {}, "signal": sig if sig else {}}
	active.append(inst)
	history.append(def.id)
	g.announce("%s — %s" % [def.name, def.desc], "event", {"eventId": def.id, "category": def.category, "duration": dur})
	recompute()
	run_actions(def.get("start", []), inst)
	for p in g.players.values():
		if p.brain and p.state == "alive":
			g.chatter.say(p, "event", {}, {"chance": 0.25})
	if dur <= 0:
		finish(inst)


func finish(inst: Dictionary) -> void:
	if not active.has(inst):
		return
	active.erase(inst)
	run_actions(inst.def.get("end", []), inst)
	if inst.duration >= 15:
		game.announce("Fin : %s" % inst.def.name, "end", {"eventId": inst.def.id})
	recompute()


func recompute() -> void:
	var g = game
	var out = default_mods()
	var lists = []
	for a in active:
		if a.def.has("mods"):
			lists.append(a.def.mods)
	if g.mission.aggro:
		lists.append({"aggro": 1, "monsterSpeed": 1.1})
	for mods in lists:
		for k in mods.keys():
			var v = mods[k]
			if k in MULTIPLY:
				out[k] = float(out[k]) * float(v)
			elif v is String:
				out[k] = v
			else:
				out[k] = 1 if (bool(out[k]) or bool(v)) else 0
	g.mods = out
	var mm = {}
	for a in active:
		var mmods = a.def.get("monsterMods", {})
		for type in mmods.keys():
			if not mm.has(type):
				mm[type] = {"speedMul": 1.0}
			mm[type].speedMul *= float(mmods[type].get("speedMul", 1.0))
	g.monster_mods = mm


func snapshot() -> Array:
	var out = []
	for a in active:
		if a.duration > 0:
			out.append({"id": a.def.id, "n": a.def.name, "c": a.def.category, "l": maxi(0, int(round(a.end - game.time)))})
	return out


# ------------------------------------------------------------------ ACTIONS
func run_actions(list, inst: Dictionary) -> void:
	for a in list:
		var fn = "act_" + String(a.do)
		if has_method(fn):
			call(fn, a, inst)
		else:
			push_warning("Action d'événement inconnue : " + String(a.do))


func _spot(at: String, inst: Dictionary):
	var g = game
	if at == "randomRoom":
		var rooms = g.map.rooms.filter(func(r): return not r.secret and not r.start)
		return g.random_point_in_room(g.rng.pick(rooms))
	if at == "randomPlayer":
		var ps = g.alive_players()
		if ps.is_empty():
			return null
		var p = g.rng.pick(ps)
		return Vector2(p.x, p.y)
	if at == "van":
		return Vector2(g.map.van.x + g.map.van.w / 2.0, g.map.van.y + g.map.van.h / 2.0)
	if at == "signal":
		return Vector2(inst.signal.x, inst.signal.y) if inst.signal.has("x") else null
	if at.begins_with("remembered:"):
		return inst.memory.get(at.substr(11))
	return null


func act_noise(a: Dictionary, inst: Dictionary) -> void:
	var g = game
	if a.at == "elevators":
		for e in g.map.elevators:
			g.emit_noise(e.x, e.y, float(a.loudness), a.type)
		return
	var spot = _spot(a.at, inst)
	if spot == null:
		return
	if a.has("remember"):
		inst.memory[a.remember] = spot
	g.emit_noise(spot.x, spot.y, float(a.loudness), a.type)
	if a.type == "siren" or a.type == "fanfare":
		g.emit_sfx(a.type, spot.x, spot.y)


func act_spawnItems(a: Dictionary, _inst: Dictionary) -> void:
	var g = game
	var rooms = []
	if a.get("where") == "danger":
		rooms = g.map.rooms.filter(func(r): return not r.secret and not r.start and r.danger > 0.6)
	elif a.get("where") == "nearPlayers":
		var ps = g.alive_players()
		var r = g.room_at(ps[0].x, ps[0].y) if not ps.is_empty() else null
		if r != null and not r.secret:
			rooms = [r]
	if rooms.is_empty():
		rooms = g.map.rooms.filter(func(r): return not r.secret)
	var theme = Data.db.THEMES[g.map.theme]
	var types = theme.loot.keys()
	var ws = []
	for t in types:
		ws.append(theme.loot[t])
	var count = int(a.get("count", 1))
	var total = count + int(a.get("junk", 0))
	for i in total:
		var type = "junk" if i >= count else (a.type if a.has("type") else g.rng.weighted(types, ws))
		var pt = g.random_point_in_room(g.rng.pick(rooms))
		if pt == null:
			continue
		var it = g.spawn_item(type, pt.x, pt.y)
		if a.get("drop", false):
			it.fall_t = 0.5 + g.rng.range_f(0, 0.8)
		if a.get("ping", false):
			g.ping(pt.x, pt.y, "Colis URGENT", 20)


func act_fakeVan(_a: Dictionary, _inst: Dictionary) -> void:
	var g = game
	var rooms = g.map.rooms.filter(func(r): return not r.start and not r.secret and r.danger > 0.3 and r.danger < 0.85 and r.w >= 5 and r.h >= 4)
	for _t in 30:
		if rooms.is_empty():
			return
		var r = g.rng.pick(rooms)
		var x = g.rng.int_range(r.x, r.x + r.w - 4)
		var y = g.rng.int_range(r.y, r.y + r.h - 3)
		var ok = true
		for yy in range(y, y + 2):
			for xx in range(x, x + 3):
				if g.grid.blocks_move(xx, yy):
					ok = false
		if ok:
			g.fake_van = {"x": x, "y": y, "w": 3, "h": 2}
			g.ping(x + 1.5, y + 1, "Fourgon ?", 40)
			return


func act_removeFakeVan(_a: Dictionary, _inst: Dictionary) -> void:
	game.fake_van = null


func act_stealCarried(a: Dictionary, _inst: Dictionary) -> void:
	var g = game
	var n = 0
	for p in g.alive_players():
		if p.carry == "" or n >= int(a.get("max", 1)):
			continue
		var it = g.items.get(p.carry)
		if it == null:
			continue
		g.drop_carried(p, {})
		var rooms = g.map.rooms.filter(func(r): return not r.secret and not r.start)
		var pt = g.random_point_in_room(g.rng.pick(rooms))
		if pt != null:
			it.x = pt.x
			it.y = pt.y
			it.vx = 0.0
			it.vy = 0.0
		g.emit_sfx("giggle", p.x, p.y)
		n += 1


func act_quotaMul(a: Dictionary, _inst: Dictionary) -> void:
	var m = game.mission
	m.quota = round(m.quota * float(a.value) / 10.0) * 10.0
	m.quotaReachedSignaled = m.deposited >= m.quota


func act_questDuck(a: Dictionary, inst: Dictionary) -> void:
	var g = game
	var rooms = g.map.rooms.filter(func(r): return not r.secret and not r.start and r.danger > 0.25 and r.danger < 0.8)
	if rooms.is_empty():
		rooms = g.map.rooms.filter(func(r): return not r.secret)
	var pick = g.rng.pick(rooms)
	var pt = g.random_point_in_room(pick)
	var cp_rooms = g.map.rooms.filter(func(r): return not r.secret and r != pick and r.danger > 0.15)
	var cp = g.random_point_in_room(g.rng.pick(cp_rooms)) if not cp_rooms.is_empty() else null
	if pt == null or cp == null:
		return
	var duck = g.spawn_item("duck", pt.x, pt.y)
	g.quest = {"kind": "duck", "item": duck.id, "x": cp.x, "y": cp.y, "r": 1.4, "reward": float(a.get("reward", 150)), "done": false}
	g.ping(pt.x, pt.y, "Canard", 15)
	g.ping(cp.x, cp.y, "Point de contrôle", 75)
	void_inst(inst)


func act_endQuest(_a: Dictionary, _inst: Dictionary) -> void:
	if game.quest != null and not game.quest.done:
		game.announce("Contrôle qualité raté. Le canard est déçu.", "fail")
	game.quest = null


func act_customerOrder(_a: Dictionary, _inst: Dictionary) -> void:
	var g = game
	var avail = g.items.values().filter(func(it): return not it.def.get("quest", false) and not it.def.get("noLoot", false) and it.type != "junk" and not it.secret)
	if avail.is_empty():
		return
	var it = g.rng.pick(avail)
	g.customer = {"type": it.type, "name": it.def.name, "until": g.time + 80, "done": false, "x": g.map.van.x - 0.5, "y": g.map.van.y - 0.5}
	g.announce("Le client veut : %s. Il paie DOUBLE." % it.def.name, "event")


func act_endCustomer(_a: Dictionary, _inst: Dictionary) -> void:
	if game.customer != null and not game.customer.done:
		game.announce("Le client est mécontent. Il a appelé ses amis…", "fail")
		force_start("hunt_night")
	game.customer = null


func act_doorChaos(a: Dictionary, _inst: Dictionary) -> void:
	var g = game
	var doors = g.map.doors.filter(func(i): return g.grid.door_broken[i] == 0)
	for _k in int(a.get("count", 3)):
		if doors.is_empty():
			return
		var i = g.rng.pick(doors)
		g.set_door(i % g.grid.w, i / g.grid.w, g.grid.door_open[i] == 0, "", 0.0 if a.get("silent", false) else 4.0)


func act_wakeMonster(_a: Dictionary, _inst: Dictionary) -> void:
	var g = game
	var sleeping = g.monsters.filter(func(m): return m.resting())
	if not sleeping.is_empty():
		var m = g.rng.pick(sleeping)
		m.cycle = {"phase": "active", "t": 60.0}
		m.behavior.on_wake(m)
		return
	g.spawner.spawn_extra()


func act_chain(a: Dictionary, _inst: Dictionary) -> void:
	force_start(a.event)


func void_inst(_i) -> void:
	pass
