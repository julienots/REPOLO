# Créatures (port de shared/sim/monsters) : déplacement par A*, ouverture des portes,
# perception, cycle chasse/repos, attaque. Le comportement propre à chaque créature est
# délégué à une classe interne (Sourdine, Inspecteur, ...), choisie d'après def.behavior.
class_name SimMonster
extends RefCounted

const PUBLIC_EX = ["click", "creak", "stomp", "bell", "lantern", "disguised", "as", "watched", "frozen"]
const HOLD_STATES = ["chase", "charge", "check", "lunge"]

static var _next_id = 1

var id: String
var game
var def: Dictionary
var type: String
var x = 0.0
var y = 0.0
var angle = 0.0
var radius = 0.4
var lair
var state = "roam"
var state_t = 0.0
var path = null
var path_goal = null
var repath_t = 0.0
var attack_cd = 0.0
var stun_t = 0.0
var heard = null            # {noise, strength} : stimulus sonore le plus fort de ce pas
var target = ""             # id du joueur ciblé
var last_seen = null        # Vector2
var cycle: Dictionary
var ex = {}                 # données de rendu spécifiques (déguisement, cloche...)
var behavior
var stuck_t = 0.0
var last_pos = Vector2.ZERO
var moving = false
var last_noise_id = 0
var group = null            # Berger : groupe de joueurs détecté


func _init(g, monster_type: String, px: float, py: float, lair_room) -> void:
	id = "m%d" % _next_id
	_next_id += 1
	game = g
	type = monster_type
	def = Data.db.MONSTERS[monster_type]
	x = px
	y = py
	angle = g.rng.range_f(-PI, PI)
	radius = float(def.radius)
	lair = lair_room
	cycle = {"phase": "active", "t": g.rng.range_f(float(def.cycle.active[0]), float(def.cycle.active[1]))}
	last_pos = Vector2(px, py)
	behavior = make_behavior(String(def.behavior))
	behavior.init(self)


static func make_behavior(kind: String):
	match kind:
		"sourdine":
			return Sourdine.new()
		"inspecteur":
			return Inspecteur.new()
		"mannequine":
			return Mannequine.new()
		"demenageur":
			return Demenageur.new()
		"berger":
			return Berger.new()
		"echo":
			return Echo.new()
		"sauveteur":
			return Sauveteur.new()
		"invite":
			return Invite.new()
	return Behavior.new()


func speed_mul() -> float:
	var g = game
	var mm = g.monster_mods.get(type, {})
	return float(g.diff.monsterSpeed) * float(g.mods.get("monsterSpeed", 1.0)) * float(mm.get("speedMul", 1.0))


func hearing_mul() -> float:
	return float(def.hearing) * float(game.mods.get("monsterHearing", 1.0)) * float(game.diff.perception)


func resting() -> bool:
	return cycle.phase == "rest"


func hunting() -> bool:
	return game.time > game.S("graceTime")


func set_state(s: String) -> void:
	if state != s:
		state = s
		state_t = 0.0
		path = null


func rand_cycle(phase: String) -> float:
	return game.rng.range_f(float(def.cycle[phase][0]), float(def.cycle[phase][1]))


func update(dt: float) -> void:
	var g = game
	state_t += dt
	attack_cd = maxf(0.0, attack_cd - dt)
	if g.mods.get("monsterFreeze", 0):
		moving = false
		ex["frozen"] = 1
		return
	ex["frozen"] = 0
	if stun_t > 0:
		stun_t -= dt
		moving = false
		return
	# cycle chasse / repos (indice : les phases de repos sont annoncées par un son propre)
	cycle.t -= dt
	if cycle.t <= 0 and not HOLD_STATES.has(state):
		if cycle.phase == "active":
			cycle = {"phase": "rest", "t": rand_cycle("rest")}
			behavior.on_rest(self)
		else:
			cycle = {"phase": "active", "t": rand_cycle("active")}
			behavior.on_wake(self)
	# perception sonore : on garde le stimulus le plus fort
	heard = null
	var hm = hearing_mul() * (0.5 if resting() else 1.0)
	for n in g.noises:
		if n.mimic or n.id <= last_noise_id or n.source == id:
			continue
		var s = g.perceived(n, x, y, hm)
		if s > 0 and (heard == null or s > heard.strength):
			heard = {"noise": n, "strength": s}
	if g.noises.size() > 0:
		last_noise_id = g.noises[g.noises.size() - 1].id
	behavior.update(self, dt)
	# détection de blocage
	var moved = Vector2(x - last_pos.x, y - last_pos.y).length()
	moving = moved > 0.01
	if path != null and moved < 0.002 * dt * 30:
		stuck_t += dt
		if stuck_t > 1.5:
			path = null
			stuck_t = 0.0
			nudge()
	else:
		stuck_t = 0.0
	last_pos = Vector2(x, y)


func nudge() -> void:
	var a = game.rng.range_f(-PI, PI)
	var r = game.grid.move_circle(x, y, cos(a) * 0.4, sin(a) * 0.4, radius)
	x = r.x
	y = r.y


func dist_to(px: float, py: float) -> float:
	return Vector2(px - x, py - y).length()


# Suivre un chemin A* jusqu'à (gx, gy). Retourne true une fois arrivé.
func move_to(gx: float, gy: float, speed: float, dt: float, arrive_dist := 0.5) -> bool:
	var g = game
	if dist_to(gx, gy) < arrive_dist:
		path = null
		return true
	repath_t -= dt
	var goal_moved = path_goal == null or path_goal.distance_to(Vector2(gx, gy)) > 1.2
	if path == null or (goal_moved and repath_t <= 0):
		var found = Pathfinding.find_path(g.grid, x, y, gx, gy, true, 3000)
		path_goal = Vector2(gx, gy)
		repath_t = 0.6
		if found.is_empty():
			path = null
			nudge()
			return false
		path = found
	if path.is_empty():
		path = null
		return true
	var wp = path[0]
	open_doors_ahead(wp)
	step_toward(wp.x, wp.y, speed, dt)
	if dist_to(wp.x, wp.y) < 0.35:
		path.pop_front()
	return false


static func turn_toward(a: float, target_a: float, max_step: float) -> float:
	var d = angle_difference(a, target_a)
	if absf(d) <= max_step:
		return target_a
	return a + signf(d) * max_step


# Déplacement direct (sans chemin) avec collisions.
func step_toward(tx: float, ty: float, speed: float, dt: float) -> Dictionary:
	var a = atan2(ty - y, tx - x)
	angle = turn_toward(angle, a, 8 * dt)
	var d = minf(speed * speed_mul() * dt, dist_to(tx, ty))
	var r = game.grid.move_circle(x, y, cos(a) * d, sin(a) * d, radius)
	x = r.x
	y = r.y
	return r


func open_doors_ahead(wp: Vector2) -> void:
	var g = game
	var grid = g.grid
	var a = atan2(wp.y - y, wp.x - x)
	var lx = int(floor(x + cos(a) * (radius + 0.5)))
	var ly = int(floor(y + sin(a) * (radius + 0.5)))
	for t in [[lx, ly], [int(floor(wp.x)), int(floor(wp.y))]]:
		if grid.get_t(t[0], t[1]) == Grid.DOOR and grid.door_open[grid.idx(t[0], t[1])] == 0:
			if behavior.smash_doors:
				g.break_door(t[0], t[1], id)
			else:
				g.set_door(t[0], t[1], true, id, 2.5)


# Joueurs visibles, du plus proche au plus lointain : [{p, d}, ...]
func visible_players() -> Array:
	var out = []
	for p in game.players.values():
		if game.monster_sees(self, p):
			out.append({"p": p, "d": dist_to(p.x, p.y)})
	out.sort_custom(func(a, b): return a.d < b.d)
	return out


# Attaque si au contact. Retourne true si un coup a été porté.
func try_attack(p, damage := -1) -> bool:
	if p == null or p.state != "alive" or attack_cd > 0 or p.hidden != 0:
		return false
	if dist_to(p.x, p.y) > radius + game.S("playerRadius") + 0.3:
		return false
	attack_cd = float(def.attackCooldown)
	game.damage_player(p, int(def.damage) if damage < 0 else damage, self)
	return true


# Pièce aléatoire pour se balader, en évitant le quai de départ au début de la partie.
func random_room_point(prefer_far := false, avoid_start := false) -> Vector2:
	var g = game
	var cur = g.room_at(x, y)
	var rooms = []
	var weights = []
	for r in g.map.rooms:
		if r.secret or (r.start and not (g.time > 150 and not avoid_start)):
			continue
		rooms.append(r)
		weights.append((0.3 + float(r.danger) if prefer_far else 1.0) * (0.2 if is_same(r, cur) else 1.0))
	var room = g.rng.weighted(rooms, weights)
	var pt = g.random_point_in_room(room)
	return pt if pt != null else Vector2(x, y)


func emit(noise_type: String, loudness: float, mimic := false, detune := 0.0) -> Dictionary:
	return game.emit_noise(x, y, loudness, noise_type, id, mimic, detune)


# --- briques de comportement communes (port de monsters/common.js)

func player_by_id(pid: String):
	return game.players.get(pid) if pid != "" else null


static func is_targetable(p) -> bool:
	return p != null and p.state == "alive" and p.hidden == 0


# Joueur ciblable le plus proche : {p, d} ou {} si personne.
func nearest_alive(filter := Callable()) -> Dictionary:
	var best = null
	var bd = INF
	for p in game.players.values():
		if not is_targetable(p) or (filter.is_valid() and not filter.call(p)):
			continue
		var d = dist_to(p.x, p.y)
		if d < bd:
			bd = d
			best = p
	return {"p": best, "d": bd} if best != null else {}


# Poursuite : ligne droite si visible et proche, sinon chemin A*.
func pursue(p, speed: float, dt: float) -> void:
	if dist_to(p.x, p.y) < 4 and game.grid.has_los(x, y, p.x, p.y):
		path = null
		step_toward(p.x, p.y, speed, dt)
	else:
		move_to(p.x, p.y, speed, dt, 0.3)


# Errance de pièce en pièce, avec pauses.
func wander(speed: float, dt: float, pause_min := 1.0, pause_max := 4.0, prefer_far := false) -> void:
	if not ex.has("wp") or not ex.has("wpWait"):
		ex["wp"] = random_room_point(prefer_far)
		ex["wpWait"] = 0.0
	if ex.wpWait > 0:
		ex.wpWait -= dt
		return
	var arrived = move_to(ex.wp.x, ex.wp.y, speed, dt, 0.6)
	if arrived or state_t > 40:
		ex.wp = random_room_point(prefer_far)
		ex.wpWait = game.rng.range_f(pause_min, pause_max)
		state_t = 0.0


# Retour au repaire pendant la phase de repos.
func go_rest(dt: float, speed: float) -> void:
	if ex.get("restPt") == null:
		var pt = game.random_point_in_room(lair)
		ex["restPt"] = pt if pt != null else Vector2(x, y)
	move_to(ex.restPt.x, ex.restPt.y, speed, dt, 0.7)


func heard_point() -> Vector2:
	return Vector2(heard.noise.x, heard.noise.y)


# Seules les données utiles au rendu / aux indices partent vers le rendu ou le réseau.
func snapshot() -> Dictionary:
	var e = {}
	for k in PUBLIC_EX:
		if ex.has(k):
			e[k] = ex[k]
	return {"id": id, "k": type, "x": snappedf(x, 0.01), "y": snappedf(y, 0.01), "a": snappedf(angle, 0.01), "s": state, "mv": 1 if moving else 0, "r": 1 if resting() else 0, "ex": e}


# ====================================================================== COMPORTEMENTS

class Behavior:
	extends RefCounted
	var smash_doors = false

	func init(_m) -> void:
		pass

	func on_rest(_m) -> void:
		pass

	func on_wake(_m) -> void:
		pass

	func on_hit_by_item(_m) -> void:
		pass

	func update(_m, _dt: float) -> void:
		pass


# LA SOURDINE — aveugle, perçoit tout par le son.
# roam → (bruit) investigate → (bruit fort/proche) chase → listen → roam
class Sourdine:
	extends Behavior

	func init(m) -> void:
		m.ex["click"] = 0
		m.ex["clickT"] = 0.0

	func on_rest(m) -> void:
		m.set_state("rest")

	func on_wake(m) -> void:
		m.set_state("roam")

	func update(m, dt: float) -> void:
		var g = m.game
		var sp = m.def.speed
		m.ex.clickT -= dt
		if m.ex.clickT <= 0:
			m.ex.click = (m.ex.click + 1) % 1000
			m.ex.clickT = 0.45 if m.state == "chase" else 1.3
		# Réaction aux sons (pendant le repos, il faut un bruit fort)
		if m.heard != null and m.hunting() and m.state != "digest":
			var s = m.heard.strength
			var n = m.heard.noise
			var threshold = 5.0 if m.resting() else 0.0
			if s > threshold:
				var src = m.player_by_id(n.source)
				var loud_and_close = s > 3.2 or m.dist_to(n.x, n.y) < 3.5
				if loud_and_close and src != null and src.state == "alive":
					m.target = src.id
					m.ex["goal"] = Vector2(n.x, n.y)
					m.set_state("chase")
					m.ex["lostT"] = 0.0
				elif m.state != "chase" or s > 4:
					m.ex["goal"] = Vector2(n.x, n.y)
					if m.state != "chase":
						m.set_state("investigate")
		match m.state:
			"rest":
				m.go_rest(dt, sp.roam)
			"roam":
				m.wander(sp.roam, dt, 2.0, 5.0, true)
			"investigate":
				if m.move_to(m.ex.goal.x, m.ex.goal.y, sp.investigate, dt, 0.6):
					m.set_state("listen")
				if m.state_t > 14:
					m.set_state("roam")
			"digest":
				# après une attaque elle s'éloigne un moment (laisse une chance de réanimer)
				m.go_rest(dt, sp.roam * 1.5)
				if m.state_t > 7:
					m.ex.erase("restPt")
					m.set_state("roam")
			"listen":
				m.angle += dt * 1.5
				if m.state_t > 2.8:
					m.set_state("rest" if m.resting() else "roam")
			"chase":
				# Elle fonce vers le DERNIER bruit entendu de sa cible, pas vers sa position réelle.
				var p = m.player_by_id(m.target)
				if m.heard != null and m.heard.noise.source == m.target:
					m.ex.goal = m.heard_point()
				var arrived = m.move_to(m.ex.goal.x, m.ex.goal.y, sp.chase, dt, 0.35)
				if p != null and m.dist_to(p.x, p.y) < 1.6:
					m.ex.goal = Vector2(p.x, p.y)
				if arrived or m.state_t > 12:
					m.set_state("listen")
		# Contact : elle percute tout ce qu'elle touche
		for p in g.players.values():
			if m.state != "digest" and p.state == "alive" and p.hidden == 0 and m.dist_to(p.x, p.y) < m.radius + 0.55:
				if m.try_attack(p):
					m.set_state("digest")


# L'INSPECTEUR — contrôle des marchandises : immobile = fouillé, en mouvement = poursuivi.
class Inspecteur:
	extends Behavior

	func init(m) -> void:
		m.ex["lantern"] = 1
		m.ex["cleared"] = {}

	func on_rest(m) -> void:
		if not ["control", "check", "chase", "carry"].has(m.state):
			m.set_state("rest")

	func on_wake(m) -> void:
		if m.state == "rest":
			m.set_state("patrol")

	func start_control(m, p) -> void:
		m.target = p.id
		m.game.say(m, "CONTRÔLE ! On ne bouge plus !", "monster")
		m.emit("monster", 9)
		m.game.signal_event("inspectorControl", {"monster": m.id, "player": p.id})
		m.set_state("control")

	func update(m, dt: float) -> void:
		var g = m.game
		var sp = m.def.speed
		if m.state == "roam":
			m.set_state("patrol")
		var visible = []
		if m.hunting():
			for v in m.visible_players():
				if v.p.state == "alive" and not (float(m.ex.cleared.get(v.p.id, 0.0)) > g.time):
					visible.append(v)
		match m.state:
			"rest":
				m.go_rest(dt, sp.roam)
				if visible.size() > 0 and visible[0].d < 5:
					start_control(m, visible[0].p)
			"patrol":
				m.wander(sp.roam, dt, 1.5, 3.5)
				if visible.size() > 0:
					start_control(m, visible[0].p)
				elif m.heard != null and m.heard.strength > 2.5 and m.hunting():
					m.ex["goal"] = m.heard_point()
					m.set_state("investigate")
			"investigate":
				if m.move_to(m.ex.goal.x, m.ex.goal.y, sp.approach, dt, 0.7) or m.state_t > 12:
					m.set_state("patrol")
				if visible.size() > 0:
					start_control(m, visible[0].p)
			"control":
				var p = m.player_by_id(m.target)
				if not SimMonster.is_targetable(p):
					m.set_state("patrol")
					return
				var d = m.dist_to(p.x, p.y)
				# Délai de réaction généreux (0,9 s) puis toute vitesse > marche lente = fuite
				if m.state_t > 0.9 and p.speed > 0.9 and d < 11:
					g.say(m, "FUITE DÉTECTÉE !", "monster")
					m.set_state("chase")
					m.target = p.id
					m.ex["lostT"] = 0.0
					return
				if d < m.radius + 0.95:
					m.set_state("check")
					m.target = p.id
					return
				m.move_to(p.x, p.y, sp.approach, dt, 0.6)
				if m.state_t > 14:
					m.set_state("patrol")
			"check":
				var p = m.player_by_id(m.target)
				if not SimMonster.is_targetable(p):
					m.set_state("patrol")
					return
				if m.state_t > 0.4 and p.speed > 1.1:
					g.say(m, "REFUS D'OBTEMPÉRER !", "monster")
					m.set_state("chase")
					m.ex["lostT"] = 0.0
					return
				if m.state_t > 1.6:
					var item = g.items.get(p.carry) if p.carry != "" else null
					if item != null:
						g.confiscate(m, p, item)
						g.say(m, "Confisqué : %s. Bureau 13." % item.def.name, "monster")
						m.ex["carrying"] = item.id
						m.set_state("carry")
					else:
						g.say(m, "Rien à déclarer. Circulez.", "monster")
						m.ex.cleared[p.id] = g.time + 25
						m.set_state("patrol")
					g.emit_sfx("stamp", m.x, m.y)
			"carry":
				# ramène l'objet au bureau (repaire)
				var item = g.items.get(m.ex.get("carrying", ""))
				if item == null or item.carried_by != m.id:
					m.ex.erase("carrying")
					m.set_state("patrol")
					return
				if m.ex.get("office") == null:
					var pt = g.random_point_in_room(m.lair)
					m.ex["office"] = pt if pt != null else Vector2(m.x, m.y)
				if m.move_to(m.ex.office.x, m.ex.office.y, sp.roam * 1.1, dt, 0.8):
					g.release_item(item, m.x, m.y)
					m.ex.erase("carrying")
					m.ex.erase("office")
					m.set_state("patrol")
			"chase":
				var p = m.player_by_id(m.target)
				if not SimMonster.is_targetable(p):
					m.set_state("patrol")
					return
				var seen = false
				for v in visible:
					if v.p == p:
						seen = true
				if seen:
					m.last_seen = Vector2(p.x, p.y)
					m.ex.lostT = 0.0
				else:
					m.ex.lostT = m.ex.get("lostT", 0.0) + dt
				if seen or m.ex.lostT < 1.2:
					m.pursue(p, sp.chase, dt)
				elif m.last_seen != null and m.move_to(m.last_seen.x, m.last_seen.y, sp.chase, dt, 0.5):
					m.last_seen = null
				if m.try_attack(p):
					m.ex.cleared[p.id] = g.time + 10
					m.set_state("patrol")
				if m.ex.lostT > 5:
					g.say(m, "Je reviendrai. Avec un formulaire.", "monster")
					m.set_state("patrol")


# LA MANNEQUINE — ne bouge que lorsque personne ne la regarde.
class Mannequine:
	extends Behavior

	func init(m) -> void:
		m.set_state("dormant")
		m.ex["creak"] = 0
		m.ex["wasFrozen"] = true

	func on_rest(m) -> void:
		if m.state == "stalk":
			m.set_state("retreat")

	func on_wake(m) -> void:
		if m.state == "retreat" or m.state == "dormant":
			m.set_state("stalk")

	func update(m, dt: float) -> void:
		var g = m.game
		var watchers = g.observed_by(m.x, m.y)
		var frozen = watchers.size() > 0
		m.ex["watched"] = 1 if frozen else 0
		if frozen:
			m.ex.wasFrozen = true
			if m.state == "dormant" and m.hunting():
				m.set_state("stalk")
			# elle « fixe » celui qui la regarde
			var w = watchers[0]
			m.angle = atan2(w.y - m.y, w.x - m.x)
			return
		if m.state == "dormant":
			if m.hunting() and m.heard != null and m.heard.strength > 3:
				m.set_state("stalk")
			return
		if m.ex.wasFrozen:
			m.ex.wasFrozen = false
			m.ex.creak += 1
		# Les zones éclairées par des lampes fixes la ralentissent fortement
		var lit = 0.3 if g.is_lit_by_lamp(m.x, m.y) else 1.0
		match m.state:
			"stalk":
				var t = m.nearest_alive()
				if t.is_empty():
					m.go_rest(dt, 2.0)
					return
				m.target = t.p.id
				m.move_to(t.p.x, t.p.y, float(m.def.speed.chase) * lit, dt, 0.2)
				if m.try_attack(t.p):
					m.set_state("retreat")
					m.ex["retreatT"] = 9.0
			"retreat", "rest":
				m.go_rest(dt, float(m.def.speed.chase) * 0.6 * lit)
				m.ex["retreatT"] = m.ex.get("retreatT", 0.0) - dt
				if m.state == "retreat" and m.ex.retreatT <= 0 and not m.resting():
					m.set_state("stalk")


# LE DÉMÉNAGEUR — colosse maladroit : renverse, défonce, charge en ligne droite, BONK.
class Demenageur:
	extends Behavior

	func init(m) -> void:
		smash_doors = true
		m.ex["stomp"] = 0
		m.ex["stompT"] = 0.0

	func on_rest(m) -> void:
		if m.state == "roam":
			m.set_state("rest")

	func on_wake(m) -> void:
		if m.state == "rest":
			m.set_state("roam")

	func windup(m, p) -> void:
		m.target = p.id
		m.set_state("windup")
		m.game.say(m, "GRRRAAAOUH !", "monster")
		m.emit("monster", 10)

	func kick_items(m) -> void:
		var g = m.game
		for it in g.items.values():
			if it.carried_by != "":
				continue
			if m.dist_to(it.x, it.y) < m.radius + it.radius() + 0.1:
				var a = atan2(it.y - m.y, it.x - m.x) + g.rng.range_f(-0.5, 0.5)
				var force = 11.0 if m.state == "charge" else 5.0
				it.vx += cos(a) * force / sqrt(it.weight())
				it.vy += sin(a) * force / sqrt(it.weight())
				it.last_touch = m.id

	func break_lamps(m) -> void:
		if m.state != "charge":
			return
		for l in m.game.map.lamps:
			if l.on and m.dist_to(l.x, l.y) < 0.9:
				l.on = false
				m.emit("break", 6)

	func update(m, dt: float) -> void:
		var g = m.game
		var sp = m.def.speed
		m.ex.stompT -= dt
		if m.ex.stompT <= 0 and m.moving:
			m.ex.stomp += 1
			m.ex.stompT = 0.25 if m.state == "charge" else 0.7
			m.emit("step", 7.0 if m.state == "charge" else 3.5)
		var vis = []
		if m.hunting():
			for v in m.visible_players():
				if v.p.state == "alive":
					vis.append(v)
		kick_items(m)
		break_lamps(m)
		match m.state:
			"rest":
				m.go_rest(dt, sp.roam)
				if vis.size() > 0 and vis[0].d < 3.5:
					windup(m, vis[0].p)
			"roam":
				m.wander(sp.roam, dt, 0.5, 2.0)
				if vis.size() > 0:
					windup(m, vis[0].p)
				elif m.heard != null and m.heard.strength > 2 and m.hunting():
					m.ex["goal"] = m.heard_point()
					m.set_state("investigate")
			"investigate":
				if m.move_to(m.ex.goal.x, m.ex.goal.y, sp.chase * 0.8, dt, 0.8) or m.state_t > 10:
					m.set_state("roam")
				if vis.size() > 0:
					windup(m, vis[0].p)
			"windup":
				# indice : il gratte le sol et rugit (0,9 s) avant de charger
				var p = m.player_by_id(m.target)
				if p != null:
					m.angle = atan2(p.y - m.y, p.x - m.x)
				if m.state_t > 0.9:
					m.ex["dir"] = m.angle
					m.set_state("charge")
					m.emit("monster", 12)
			"charge":
				var s = float(sp.charge) * m.speed_mul() * dt
				var r = g.grid.move_circle(m.x, m.y, cos(m.ex.dir) * s, sin(m.ex.dir) * s, m.radius)
				if r.hit_x or r.hit_y:
					# casse ce qu'il percute : murs fissurés, portes
					var fx = int(floor(m.x + cos(m.ex.dir) * (m.radius + 0.4)))
					var fy = int(floor(m.y + sin(m.ex.dir) * (m.radius + 0.4)))
					for t in [[fx, fy], [fx + 1, fy], [fx - 1, fy], [fx, fy + 1], [fx, fy - 1]]:
						var tile = g.grid.get_t(t[0], t[1])
						if tile == Grid.CRACKED:
							g.break_wall(t[0], t[1], m.id)
						if tile == Grid.DOOR:
							g.break_door(t[0], t[1], m.id)
					m.x = r.x
					m.y = r.y
					m.stun_t = 3.0
					m.set_state("stunned")
					m.emit("bonk", 11)
					g.flag("bonk")
					g.signal_event("bonk", {"monster": m.id})
					g.shake(m.x, m.y, 4)
					return
				m.x = r.x
				m.y = r.y
				for p in g.players.values():
					if p.state == "alive" and p.hidden == 0 and m.dist_to(p.x, p.y) < m.radius + 0.5 and m.attack_cd <= 0:
						m.attack_cd = float(m.def.attackCooldown)
						g.damage_player(p, int(m.def.damage), m, {"knock": 9.0, "dir": m.ex.dir})
				if m.state_t > 2.0:
					m.set_state("chase")
			"stunned":
				m.set_state("chase")
			"chase":
				var p = m.player_by_id(m.target)
				if not SimMonster.is_targetable(p) or m.state_t > 5:
					m.set_state("roam")
					return
				m.pursue(p, sp.chase, dt)
				m.try_attack(p)
				if m.state_t > 1.2:
					for v in vis:
						if v.p == p and v.d > 2.5 and v.d < 7:
							windup(m, p)
							break


# LE BERGER — attiré par les groupes, il les disperse puis chasse le plus isolé.
class Berger:
	extends Behavior
	const GROUP_RADIUS = 4.5
	const SENSE_RANGE = 22.0

	func init(m) -> void:
		m.ex["bell"] = 0
		m.ex["scanT"] = 0.0

	func on_rest(m) -> void:
		if m.state == "roam" or m.state == "stalk":
			m.set_state("rest")

	func on_wake(m) -> void:
		if m.state == "rest":
			m.set_state("roam")

	func isolation(m, p) -> float:
		var best = INF
		for o in m.game.players.values():
			if o == p or (o.state != "alive" and o.state != "downed"):
				continue
			best = minf(best, Vector2(o.x - p.x, o.y - p.y).length())
		return 99.0 if best == INF else best

	func find_group(m):
		var ps = []
		for p in m.game.players.values():
			if p.state == "alive" and p.hidden == 0 and m.dist_to(p.x, p.y) < SENSE_RANGE:
				ps.append(p)
		var best = null
		for p in ps:
			var members = ps.filter(func(o): return Vector2(o.x - p.x, o.y - p.y).length() < GROUP_RADIUS)
			if members.size() >= 2 and (best == null or members.size() > best.members.size()):
				var sx = 0.0
				var sy = 0.0
				for o in members:
					sx += o.x
					sy += o.y
				best = {"members": members, "x": sx / members.size(), "y": sy / members.size()}
		return best

	func update(m, dt: float) -> void:
		var g = m.game
		var sp = m.def.speed
		m.ex.scanT -= dt
		if m.ex.scanT <= 0:
			m.ex.scanT = 0.5
			m.group = find_group(m)
			m.ex.bell = m.group.members.size() if m.group != null else 0
		var grp = m.group
		match m.state:
			"rest":
				m.go_rest(dt, sp.roam)
				if grp != null and grp.members.size() >= 3 and m.hunting():
					m.set_state("stalk")
			"roam":
				m.wander(sp.roam, dt, 1.0, 3.0)
				if grp != null and m.hunting():
					m.set_state("stalk")
				# opportuniste : attaque un joueur seul qu'il voit de près
				var vis = m.visible_players() if m.hunting() else []
				if vis.size() > 0 and vis[0].d < 5 and isolation(m, vis[0].p) > GROUP_RADIUS:
					m.target = vis[0].p.id
					m.set_state("chase")
			"stalk":
				if grp == null:
					m.set_state("roam")
					return
				m.move_to(grp.x, grp.y, sp.stalk, dt, 1.0)
				var d = m.dist_to(grp.x, grp.y)
				var sees = false
				for p in grp.members:
					if g.grid.has_los(m.x, m.y, p.x, p.y):
						sees = true
				if d < 5.5 and sees:
					m.set_state("ring")
					g.say(m, "♪ DING… DING… DISPERSION. ♪", "monster")
					m.emit("monster", 10)
				if m.state_t > 30:
					m.set_state("roam")
			"ring":
				# indice clair : 1,2 s de cloche avant l'onde de choc
				if m.state_t > 1.2:
					for p in g.players.values():
						if p.state != "alive" or p.hidden != 0:
							continue
						var d = m.dist_to(p.x, p.y)
						if d < 7 and g.grid.has_los(m.x, m.y, p.x, p.y):
							g.knockback(p, atan2(p.y - m.y, p.x - m.x), 8 * (1 - d / 9))
							if p.carry != "":
								g.drop_carried(p, {"fling": 4.0, "reason": "scatter"})
							p.flicker_t = 2.0
					m.emit("monster", 9)
					g.shake(m.x, m.y, 3)
					# cible : le plus isolé à portée
					var best = null
					var bi = -1.0
					for p in g.players.values():
						if not SimMonster.is_targetable(p) or m.dist_to(p.x, p.y) > 16:
							continue
						var iso = isolation(m, p)
						if iso > bi:
							bi = iso
							best = p
					if best != null:
						m.target = best.id
						m.set_state("chase")
					else:
						m.set_state("roam")
			"chase":
				var p = m.player_by_id(m.target)
				if not SimMonster.is_targetable(p) or m.state_t > 11:
					m.set_state("roam")
					return
				# si la cible rejoint un groupe, il perd son intérêt (et recommence à rôder)
				if m.state_t > 3 and isolation(m, p) < 2.5:
					m.set_state("stalk")
					return
				m.pursue(p, sp.chase, dt)
				if m.try_attack(p):
					m.set_state("roam")


# L'ÉCHO — enregistre les sons et les rejoue (légèrement désaccordés) pour attirer les joueurs.
class Echo:
	extends Behavior
	const COPYABLE = ["step", "door", "impact", "kaching", "chat", "voice", "squeak", "radio", "step_debris"]

	func init(m) -> void:
		m.ex["memory"] = []
		m.ex["mimicT"] = 12.0

	func on_rest(m) -> void:
		if m.state == "roam" or m.state == "lurk":
			m.set_state("rest")

	func on_wake(m) -> void:
		if m.state == "rest":
			m.set_state("roam")

	func mimic(m) -> void:
		var g = m.game
		m.ex.mimicT = g.rng.range_f(9, 15)
		var mem = m.ex.memory
		var detune = g.rng.range_f(0.06, 0.12)
		if mem.is_empty() or g.rng.chance(0.3):
			# réplique déformée d'une voix de collègue (bulle signée « ??? »)
			g.say(m, g.rng.pick(Data.db.MIMIC_LINES), "mimic")
			m.emit("voice", 5, true, detune)
			return
		var s = g.rng.pick(mem)
		m.emit(s.type, maxf(3.0, s.loudness), true, detune)
		if s.type == "step":
			m.emit("step", 3, true, detune)

	func update(m, dt: float) -> void:
		var sp = m.def.speed
		if m.heard != null and COPYABLE.has(m.heard.noise.type) and not m.heard.noise.mimic:
			var mem = m.ex.memory
			if mem.is_empty() or mem[mem.size() - 1].type != m.heard.noise.type:
				mem.append({"type": m.heard.noise.type, "loudness": minf(8.0, m.heard.noise.loudness)})
			if mem.size() > 8:
				mem.pop_front()
		m.ex.mimicT -= dt
		var vis = []
		if m.hunting():
			for v in m.visible_players():
				if v.p.state == "alive":
					vis.append(v)
		match m.state:
			"rest":
				m.go_rest(dt, sp.roam)
			"roam":
				m.wander(sp.roam, dt, 2.0, 6.0)
				var near = m.nearest_alive()
				if m.hunting() and not near.is_empty() and near.d > 5 and near.d < 18 and m.ex.mimicT <= 0:
					mimic(m)
					m.set_state("lurk")
				if vis.size() > 0 and vis[0].d < 2.5:
					m.target = vis[0].p.id
					m.set_state("chase")
			"lurk":
				# immobile, dans le noir, il attend que quelqu'un vienne voir
				var near = m.nearest_alive()
				if not near.is_empty() and near.d < 2.4:
					m.target = near.p.id
					m.set_state("chase")
					m.emit("monster", 7)
					return
				if m.state_t > 4 and m.ex.mimicT <= 0 and not near.is_empty() and near.d < 16:
					mimic(m)
				if m.state_t > 16:
					m.set_state("roam")
			"chase":
				var p = m.player_by_id(m.target)
				if not SimMonster.is_targetable(p) or m.state_t > 6:
					m.set_state("roam")
					m.ex.mimicT = 8.0
					return
				m.pursue(p, sp.chase, dt)
				if m.try_attack(p):
					m.set_state("roam")
					m.ex.mimicT = 10.0


# LE FAUX SAUVETEUR — guide les joueurs « vers la sortie »… dans un cul-de-sac.
# Démasqué si on l'éclaire en plein visage 1,6 s de près.
class Sauveteur:
	extends Behavior

	func init(m) -> void:
		m.ex["lantern"] = 1
		m.ex["disguised"] = 1
		m.ex["exposeT"] = 0.0
		m.ex["talkT"] = 0.0

	func on_rest(m) -> void:
		if m.state == "roam":
			m.set_state("rest")

	func on_wake(m) -> void:
		if m.state == "rest":
			m.set_state("roam")

	func talk(m, force: bool) -> void:
		if not force and m.ex.talkT > 0:
			return
		m.ex.talkT = m.game.rng.range_f(4, 7)
		m.game.say(m, m.game.rng.pick(Data.db.RESCUER_LINES), "rescuer")

	# Destination piège : une salle dangereuse.
	func pick_trap(m) -> Vector2:
		var g = m.game
		var rooms = g.map.rooms.filter(func(r): return not r.start and not r.secret and r.danger > 0.5)
		var r = m.lair
		if rooms.size() > 0:
			var weights = []
			for rm in rooms:
				weights.append(rm.danger)
			r = g.rng.weighted(rooms, weights)
		var pt = g.random_point_in_room(r)
		return pt if pt != null else Vector2(m.x, m.y)

	func update(m, dt: float) -> void:
		var g = m.game
		var sp = m.def.speed
		m.ex.talkT -= dt
		# démasquage par la lampe
		if m.ex.disguised:
			var lit = false
			for p in g.players.values():
				if p.state == "alive" and m.dist_to(p.x, p.y) < 6 and g.in_flashlight(p, m.x, m.y):
					lit = true
			m.ex.exposeT = m.ex.exposeT + dt if lit else maxf(0.0, m.ex.exposeT - dt * 0.5)
			if m.ex.exposeT > 1.6 and m.state != "reveal":
				m.ex.disguised = 0
				m.ex.lantern = 0
				g.say(m, "GRILLÉ !!!", "monster")
				m.emit("monster", 11)
				g.signal_event("monsterExposed", {"monster": m.id})
				m.set_state("flee")
		match m.state:
			"rest":
				m.go_rest(dt, sp.roam)
			"roam":
				m.wander(sp.roam, dt, 1.0, 3.0)
				if m.hunting() and m.ex.disguised:
					for v in m.visible_players():
						if v.p.state == "alive":
							m.target = v.p.id
							m.set_state("approach")
							break
			"approach":
				var p = m.player_by_id(m.target)
				if not SimMonster.is_targetable(p):
					m.set_state("roam")
					return
				if m.move_to(p.x, p.y, sp.lead, dt, 2.6) or m.dist_to(p.x, p.y) < 2.8:
					talk(m, true)
					m.ex["dest"] = pick_trap(m)
					m.set_state("lead")
				if m.state_t > 15:
					m.set_state("roam")
			"lead":
				var near = m.nearest_alive()
				var follower_close = not near.is_empty() and near.d < 6.5
				m.ex["ignoredT"] = 0.0 if follower_close else m.ex.get("ignoredT", 0.0) + dt
				if follower_close:
					m.move_to(m.ex.dest.x, m.ex.dest.y, sp.lead, dt, 0.8)
					m.target = near.p.id
				else:
					# il attend et appelle
					if not near.is_empty():
						m.angle = atan2(near.p.y - m.y, near.p.x - m.x)
					talk(m, false)
				var at_dest = m.dist_to(m.ex.dest.x, m.ex.dest.y) < 1.4
				if not near.is_empty() and ((at_dest and near.d < 3.2) or (m.state_t > 35 and near.d < 2.5)):
					m.set_state("reveal")
					m.ex.disguised = 0
					m.ex.lantern = 0
					g.say(m, "Voilà… la sortie… HAHAHA !", "monster")
					m.emit("monster", 12)
				if m.ex.ignoredT > 18:
					m.set_state("roam")
			"reveal":
				if m.state_t > 0.7:
					m.set_state("chase")
			"chase":
				var p = m.player_by_id(m.target)
				if not SimMonster.is_targetable(p) or m.state_t > 9:
					m.set_state("flee")
					return
				m.pursue(p, sp.chase, dt)
				if m.try_attack(p):
					m.set_state("flee")
			"flee":
				if m.ex.get("fleePt") == null:
					var pt = g.random_point_in_room(m.lair)
					m.ex["fleePt"] = pt if pt != null else m.random_room_point()
				m.move_to(m.ex.fleePt.x, m.ex.fleePt.y, sp.flee, dt, 0.8)
				if m.state_t > 7:
					# il remet son déguisement plus tard
					m.ex.erase("fleePt")
					m.ex.disguised = 1
					m.ex.lantern = 1
					m.ex.exposeT = 0.0
					m.cycle = {"phase": "rest", "t": m.rand_cycle("rest")}
					m.set_state("rest")


# LE DERNIER INVITÉ — prend l'apparence d'un coéquipier éloigné, attaque si on lui tourne le dos.
# Démasqué si on lui lance un objet ou si on l'éclaire de près 1,2 s.
class Invite:
	extends Behavior

	func init(m) -> void:
		m.ex["as"] = null
		m.ex["exposeT"] = 0.0
		m.ex["chatT"] = 6.0

	func on_rest(m) -> void:
		if m.state == "roam":
			m.set_state("rest")

	func on_wake(m) -> void:
		if m.state == "rest":
			m.set_state("roam")

	func on_hit_by_item(m) -> void:
		reveal(m, "AÏE ! …HIHIHI.")

	func reveal(m, text: String) -> void:
		if m.state == "flee":
			return
		m.ex["as"] = null
		m.game.say(m, text, "monster")
		m.emit("monster", 9)
		m.game.signal_event("monsterExposed", {"monster": m.id})
		m.set_state("flee")

	# Copie quelqu'un qui est loin (>12 cases) de la créature
	func pick_identity(m):
		var g = m.game
		var ps = g.players.values().filter(func(p): return p.state == "alive" or p.state == "downed")
		if ps.size() < 2:
			return null
		var candidates = ps.filter(func(p): return m.dist_to(p.x, p.y) > 12)
		return g.rng.pick(candidates).id if candidates.size() > 0 else null

	func update(m, dt: float) -> void:
		var g = m.game
		var sp = m.def.speed
		# choix / maintien du déguisement
		if m.ex["as"] == null or not g.players.has(m.ex["as"]):
			m.ex["as"] = pick_identity(m)
		var victim = g.players.get(m.ex["as"]) if m.ex["as"] != null else null
		# si la personne copiée est toute proche, le déguisement serait évident : il s'éloigne
		var victim_near = victim != null and m.dist_to(victim.x, victim.y) < 7
		if m.ex["as"] != null and m.state != "flee":
			var lit = false
			for p in g.players.values():
				if p.state == "alive" and m.dist_to(p.x, p.y) < 3.2 and g.in_flashlight(p, m.x, m.y):
					lit = true
			m.ex.exposeT = m.ex.exposeT + dt if lit else maxf(0.0, m.ex.exposeT - dt)
			if m.ex.exposeT > 1.2:
				reveal(m, "IIIIIIIIIH !")
		match m.state:
			"rest":
				m.go_rest(dt, sp.roam)
			"roam":
				m.wander(sp.roam, dt, 0.5, 2.0)
				var me_as = m.ex["as"]
				var near = m.nearest_alive(func(p): return p.id != me_as) if m.hunting() else {}
				if not near.is_empty() and near.d < 12 and m.ex["as"] != null:
					m.target = near.p.id
					m.set_state("approach")
			"approach":
				var p = m.player_by_id(m.target)
				if not SimMonster.is_targetable(p) or victim_near:
					m.set_state("roam")
					m.ex["as"] = null
					return
				var d = m.dist_to(p.x, p.y)
				if d > 2.2:
					m.move_to(p.x, p.y, sp.approach, dt, 2.0)
				else:
					m.angle = atan2(p.y - m.y, p.x - m.x)
				m.ex.chatT -= dt
				if m.ex.chatT <= 0 and d < 8:
					m.ex.chatT = g.rng.range_f(7, 12)
					g.say(m, g.rng.pick(Data.db.MIMIC_LINES), "disguised")
				# s'il nous tourne le dos de près… ou après un moment
				var facing = absf(angle_difference(p.angle, atan2(m.y - p.y, m.x - p.x)))
				if (d < 2.6 and facing > 1.9 and m.state_t > 3) or (m.state_t > 22 and d < 3):
					m.set_state("lunge")
					m.emit("monster", 8)
				if m.state_t > 40:
					m.set_state("roam")
			"lunge":
				var p = m.player_by_id(m.target)
				if not SimMonster.is_targetable(p) or m.state_t > 3:
					m.set_state("roam")
					return
				m.pursue(p, sp.chase, dt)
				if m.try_attack(p):
					reveal(m, "HIHIHIHI !")
			"flee":
				if m.ex.get("fleePt") == null:
					m.ex["fleePt"] = m.random_room_point(true)
				m.move_to(m.ex.fleePt.x, m.ex.fleePt.y, sp.flee, dt, 0.8)
				if m.state_t > 6:
					m.ex.erase("fleePt")
					m.ex["as"] = null
					m.ex.exposeT = 0.0
					m.cycle = {"phase": "rest", "t": m.rand_cycle("rest")}
					m.set_state("rest")
