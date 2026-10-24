# État côté client pour une partie EN LIGNE : le serveur (Node, même code de règles que
# la version web) fait autorité ; ce miroir expose la même interface que GameSim au
# rendu 3D (joueurs, objets, mission, carte), prédit le déplacement du joueur local et
# transmet ses actions. Les instantanés reçus sont rejoués tels quels par Game3D.
class_name ClientState
extends RefCounted

var net: NetClient
var you = ""
var map: Dictionary
var grid: Grid
var simc: Dictionary
var players = {}
var items = {}
var mission = {"ended": false, "departing": false, "deposited": 0.0, "quota": 1.0, "success": false, "timeLeft": 0.0}
var mission_def = {}
var info: Dictionary
var result: Dictionary = {}
var pending = []
var last_snap: Dictionary = {}
var send_t = 0.0
var voice_t = 0.0
var mods = {}


class ClientItem:
	extends RefCounted
	var id = ""
	var type = ""
	var def: Dictionary
	var x = 0.0
	var y = 0.0
	var carried_by = ""
	var helper = ""
	var fall_t = 0.0
	var value = 0.0

	func radius() -> float:
		return float(def.radius)

	func weight() -> int:
		return int(def.weight)


func _init(client: NetClient, start_info: Dictionary, my_id: String) -> void:
	net = client
	info = start_info
	you = my_id
	simc = Data.db.SIM
	map = MapGen.deserialize(start_info.map)
	grid = map.grid
	mission_def = {"name": start_info.mission.name, "brief": start_info.mission.get("brief", "")}
	mission.quota = float(start_info.mission.get("quota", 1))
	for r in start_info.roster:
		var p = SimEntities.SimPlayer.new({"id": String(r.id), "name": r.name, "isBot": bool(r.get("bot", false)), "botProfile": r.get("botProfile", ""),
			"cosmetics": r.get("cosmetics", {}), "equipment": r.get("equipment", "radio")})
		p.x = float(map.spawn.x)
		p.y = float(map.spawn.y)
		players[p.id] = p
	net.message.connect(_on_message)


func S(key: String) -> float:
	return float(simc[key])


func start_info() -> Dictionary:
	return info


func _on_message(msg: Dictionary) -> void:
	match msg.get("t"):
		"snap":
			pending.append(msg)
		"result":
			result = msg.result
			mission.ended = true


func me():
	return players.get(you)


# ------------------------------------------------------------------ ACTIONS (envoyées au serveur)
func interact(p) -> void:
	net.send({"t": "act", "a": "boo" if p.state == "dead" else "interact"})


func release(_p) -> void:
	net.send({"t": "act", "a": "release"})


func throw_item(_p) -> void:
	net.send({"t": "act", "a": "throw"})


func use_utility(_p) -> void:
	net.send({"t": "act", "a": "utility"})


func bump_door(_p, tx: int, ty: int) -> void:
	net.send({"t": "act", "a": "door", "x": tx, "y": ty})


func set_voice(_p, level: float, radio: bool) -> void:
	if voice_t <= 0:
		voice_t = 0.1
		net.send({"t": "voice", "lv": snappedf(level, 0.01), "radio": radio})


func finish(_reason: String) -> void:
	net.send({"t": "abandon"})


func set_bot_control(_id: String, _on: bool) -> void:
	pass


func player_env(p) -> Dictionary:
	return {"speedMul": float(p.get_meta("sm", 1.0)), "friction": float(p.get_meta("fr", 1.0))}


func step_movement(p, mx: float, my: float, mode: String, env: Dictionary, dt: float) -> void:
	GameSim.move_step(grid, map.w, map.h, simc, p, mx, my, mode, env, dt)


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


# ------------------------------------------------------------------ BOUCLE
func step(dt: float) -> void:
	voice_t -= dt
	send_t -= dt
	var p = me()
	if p != null and send_t <= 0:
		send_t = 0.05
		net.send({"t": "st", "x": snappedf(p.x, 0.001), "y": snappedf(p.y, 0.001), "a": snappedf(p.angle, 0.01), "l": p.light, "m": p.move_mode, "tp": p.tp})


# Fusionne les instantanés reçus depuis le dernier pas (bruits et messages cumulés).
func snapshot() -> Dictionary:
	if pending.is_empty():
		if last_snap.is_empty():
			return {}
		var s = last_snap.duplicate()
		s.noises = []
		s.msgs = []
		s.tiles = []
		return s
	var noises = []
	var msgs = []
	for s in pending:
		noises.append_array(s.get("noises", []))
		msgs.append_array(s.get("msgs", []))
		for tc in s.get("tiles", []):
			grid.set_t(int(tc[0]) % grid.w, int(tc[0]) / grid.w, int(tc[1]))
	var snap = pending[pending.size() - 1].duplicate()
	pending.clear()
	snap.erase("t")
	snap.noises = noises
	snap.msgs = msgs
	_apply(snap)
	last_snap = snap
	return snap


func _apply(s: Dictionary) -> void:
	var m = s.mission
	mission.deposited = float(m.d)
	mission.quota = float(m.q)
	mission.timeLeft = float(m.tl)
	mission.departing = float(m.dep) >= 0
	if int(m.get("end", 0)) == 1:
		mission.ended = true
	mods = s.get("mods", {})
	# portes : "0" fermée, "1" ouverte, "2" défoncée
	var ds = String(s.get("doors", ""))
	for k in mini(ds.length(), map.doors.size()):
		var i = map.doors[k]
		var c = ds.unicode_at(k) - 48
		grid.door_broken[i] = 1 if c == 2 else 0
		grid.door_open[i] = 1 if c >= 1 else 0
	var ls = String(s.get("lamps", ""))
	for k in mini(ls.length(), map.lamps.size()):
		map.lamps[k].on = ls[k] == "1"
	for ps in s.players:
		var p = players.get(ps.id)
		if p == null:
			p = SimEntities.SimPlayer.new({"id": String(ps.id), "name": String(ps.id)})
			players[p.id] = p
		var mine = p.id == you
		var tp = int(ps.get("tp", 0))
		if mine:
			# prédiction locale : on ne recale que sur téléportation (casier, monte-charge) ou gros écart
			var far = Vector2(float(ps.x) - p.x, float(ps.y) - p.y).length() > 2.0
			if tp != p.tp or far or ps.get("h") != null or String(ps.st) == "extracted" or int(ps.get("bot", 0)) == 1:
				p.x = float(ps.x)
				p.y = float(ps.y)
				p.vx = 0.0
				p.vy = 0.0
			p.tp = tp
			if int(ps.get("bot", 0)) == 1:
				p.angle = float(ps.a)
		else:
			p.x = float(ps.x)
			p.y = float(ps.y)
			p.angle = float(ps.a)
			p.light = int(ps.l) == 1
			p.move_mode = String(ps.get("m", "walk"))
		p.state = String(ps.st)
		p.hp = int(ps.hp)
		p.carry = String(ps.c) if ps.get("c") != null else ""
		p.hidden = int(ps.h) if ps.get("h") != null else 0
		p.battery = float(ps.b)
		p.stamina = float(ps.s)
		p.flicker_t = 0.5 if int(ps.get("fl", 0)) == 1 else 0.0
		p.equipment = String(ps.get("eq", p.equipment))
		p.charges = int(ps.get("ch", 0))
		p.speed = float(ps.get("sp", 0.0))
		p.down_t = float(ps.get("dn", 0.0))
		p.set_meta("sm", float(ps.get("sm", 1.0)))
		p.set_meta("fr", float(ps.get("fr", 1.0)))
		if mine and p.battery <= 0:
			p.light = false
	var seen = {}
	for it in s.items:
		seen[it.id] = true
		var ci = items.get(it.id)
		if ci == null:
			ci = ClientItem.new()
			ci.id = String(it.id)
			ci.type = String(it.k)
			ci.def = Data.db.ITEMS.get(ci.type, Data.db.ITEMS.junk)
			items[ci.id] = ci
		ci.x = float(it.x)
		ci.y = float(it.y)
		ci.carried_by = String(it.c) if it.get("c") != null else ""
		ci.helper = String(it.h) if it.get("h") != null else ""
		ci.fall_t = float(it.get("f", 0.0))
		ci.value = float(it.v)
	for id in items.keys():
		if not seen.has(id):
			items.erase(id)
