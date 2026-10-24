# IA des bots coéquipiers (port de shared/sim/bots/brain.js) :
# perception → mémoire → décision utilitaire → exécution. Les traits de personnalité
# (prudent, courageux, paniqué, cupide, protecteur, comique) modulent chaque score.
class_name SimBotBrain
extends RefCounted

const DANGER_STATES = ["chase", "charge", "lunge", "windup", "reveal", "ring", "investigate", "stalk"]
const ARRIVE = {"loot": 0.7, "deliver": 0.6, "quest": 0.6, "wait": 0.9, "freeze": 99.0}

var g
var p
var goal = null             # {kind, x, y, id}
var goal_t = 0.0
var path = null
var repath_t = 0.0
var decide_t = 0.0
var known = {}              # id du monstre → {x, y, t, type, state, target, ex, disguised, heard}
var explored = {}
var talk_cd = 0.0
var stuck_t = 0.0
var stuck_count = 0
var last_pos = Vector2.ZERO
var panic_t = 0.0
var panic_dir = 0.0
var hide_calm_t = 0.0
var idle_t = 0.0
var flee_from = null
var flee_start_t = 0.0
var was_fleeing = false
var aim_at = null
var holding = false
var last_spotted = {}
var input_mx = 0.0
var input_my = 0.0
var input_mode = "walk"
var pause_until = 0.0
var inspector_react = ""
var said_quota = false
var failed = {}


func _init(game, player) -> void:
	g = game
	p = player
	talk_cd = g.time + g.rng.range_f(3, 8)
	last_pos = Vector2(p.x, p.y)
	idle_t = g.time + g.rng.range_f(18, 35)


func prof() -> Dictionary:
	return p.profile


func dist_to(x: float, y: float) -> float:
	return Vector2(x - p.x, y - p.y).length()


func update(dt: float) -> void:
	perceive()
	decide_t -= dt
	if decide_t <= 0:
		decide_t = 0.25 + g.rng.range_f(0, 0.1)
		decide()
	execute(dt)


# ---------------------------------------------------------------- PERCEPTION
func remember(m, x: float, y: float, extra := {}) -> void:
	var k = {"x": x, "y": y, "t": g.time, "type": m.type, "state": m.state, "target": m.target, "ex": m.ex, "disguised": false, "heard": false}
	k.merge(extra, true)
	known[m.id] = k


func perceive() -> void:
	var pr = prof()
	var room = g.room_at(p.x, p.y)
	if room != null and not explored.has(room.id):
		explored[room.id] = true
		if g.time > 3 and g.rng.chance(0.6):
			pause_until = g.time + g.rng.range_f(0.8, 2.2) * (1.4 - float(pr.bravery) * 0.6)
	for m in g.monsters:
		if g.player_sees(p, m):
			# le Dernier Invité trompe les bots peu méfiants
			var disguised = m.type == "invite" and m.ex.get("as") != null and float(pr.caution) < 0.7
			var is_new = not known.has(m.id) or g.time - known[m.id].t > 8
			remember(m, m.x, m.y, {"disguised": disguised})
			if is_new and not disguised:
				on_spot(m)
	# ouïe : chaque créature a une signature sonore (cliquetis, cloche, pas lourds…)
	for m in g.monsters:
		var d = dist_to(m.x, m.y)
		var rng_v = 9.0 if (m.type == "demenageur" or m.type == "berger") else (0.0 if m.type == "sauveteur" else 5.5)
		if d < rng_v and (not known.has(m.id) or g.time - known[m.id].t > 0.5):
			remember(m, m.x + g.rng.range_f(-1, 1), m.y + g.rng.range_f(-1, 1), {"heard": true})
	for n in g.noises:
		if n.mimic and float(pr.caution) > 0.8:
			continue
		var src = null
		for mm in g.monsters:
			if mm.id == n.source:
				src = mm
				break
		if src == null:
			continue
		if g.perceived(n, p.x, p.y, 1.0) > 1:
			remember(src, n.x, n.y, {"heard": true})
	for id in known.keys():
		if g.time - known[id].t > 9:
			known.erase(id)


func on_spot(m) -> void:
	var pr = prof()
	if float(last_spotted.get(m.type, -100.0)) > g.time - 20:
		return
	last_spotted[m.type] = g.time
	if m.type == "sauveteur" and m.ex.get("disguised", 0) and float(pr.caution) < 0.5:
		g.chatter.say(p, "follow_rescuer", {}, {"force": true})
		return
	if m.type == "sauveteur" and m.ex.get("disguised", 0):
		g.bot_speak(p, "Sa lanterne est VERTE. C'est pas un vrai sauveteur !", "talk")
		return
	g.chatter.say(p, "spot_monster", {"monster": m.def.name}, {"force": true})
	# le comique / paniqué lâche parfois son objet de surprise
	if p.carry != "" and g.rng.chance(float(pr.clumsy) * 0.45):
		g.drop_carried(p, {"fling": 2.0, "reason": "scared"})
		g.chatter.say(p, "drop_scared", {}, {"force": true})


func threat_info():
	var pr = prof()
	var best = null
	for k in known.values():
		if k.disguised:
			continue
		if k.type == "sauveteur" and k.ex.get("disguised", 0) and float(pr.caution) < 0.5:
			continue
		var d = dist_to(k.x, k.y)
		var danger = 0.0
		if DANGER_STATES.has(k.state):
			danger = 1.0
		if k.target == p.id and k.state != "roam":
			danger = 1.4
		if k.type == "sourdine" and d < 5:
			danger = maxf(danger, 0.8)
		if k.type == "demenageur" and d < 6:
			danger = maxf(danger, 0.7)
		if k.type == "mannequine":
			danger = maxf(danger, 0.4)
		if k.type == "inspecteur" and k.state == "patrol":
			danger = 0.5 if p.carry != "" else 0.1
		if k.state == "rest" or k.state == "dormant":
			danger *= 0.3
		var score = danger * maxf(0.0, 1.0 - d / 14.0)
		if score > 0 and (best == null or score > best.score):
			best = k.duplicate()
			best["d"] = d
			best["score"] = score
	return best


# ---------------------------------------------------------------- DÉCISION
func decide() -> void:
	var pr = prof()
	var mission = g.mission
	aim_at = null
	if p.state == "dead":
		ghost_wander()
		return
	if p.state == "downed":
		set_goal("crawl", nearest_teammate_or_van())
		return
	# dans un casier : sortir quand c'est calme
	if p.hidden != 0:
		var t = threat_info()
		hide_calm_t = 0.0 if (t != null and t.d < 9) else hide_calm_t + 0.25
		if hide_calm_t > 4 + float(pr.caution) * 4 or mission.departing:
			g.interact(p)
		goal = null
		return
	# L'Inspecteur crie « CONTRÔLE ! » : on s'arrête… sauf les impulsifs
	var insp = null
	for m in g.monsters:
		if m.type == "inspecteur" and (m.state == "control" or m.state == "check") and m.target == p.id:
			insp = m
			break
	if insp != null:
		if inspector_react == "":
			var run = (float(pr.panic) > 0.8 and g.rng.chance(0.7)) or (p.carry != "" and float(pr.greed) > 0.9 and g.rng.chance(0.5))
			inspector_react = "run" if run else "freeze"
			g.chatter.say(p, "inspector_stop", {}, {"force": true})
		if inspector_react == "freeze":
			set_goal("freeze", Vector2(p.x, p.y))
			aim_at = Vector2(insp.x, insp.y)
			return
		flee_from = Vector2(insp.x, insp.y)
		set_goal("flee", flee_point(insp.x, insp.y), true)
		return
	inspector_react = ""
	# La Mannequine : la garder dans le faisceau
	for k in known.values():
		if k.type == "mannequine" and dist_to(k.x, k.y) < 10 and g.time - k.t < 2:
			if g.rng.chance(float(pr.panic) * 0.15):
				break
			aim_at = Vector2(k.x, k.y)
	# Menace
	var threat = threat_info()
	var fear_radius = 3 + float(pr.caution) * 4 + (1 - float(pr.bravery)) * 3
	if threat != null and threat.d < fear_radius and threat.score > 0.12 and threat.type != "mannequine":
		if flee_from == null or g.time - flee_start_t > 1.2:
			flee_start_t = g.time
			flee_from = Vector2(threat.x, threat.y)
			if not was_fleeing:
				g.chatter.say(p, "flee", {}, {"chance": 0.9})
			# se cacher ?
			var locker = near_locker(4.5)
			if locker != null and (float(pr.caution) > 0.55 or threat.target == p.id) and g.rng.chance(0.6):
				set_goal("hide", locker, true)
				was_fleeing = true
				return
			# le paniqué part parfois n'importe où
			if g.rng.chance(float(pr.panic) * 0.35):
				panic_t = g.time + 1.5
				panic_dir = g.rng.range_f(-PI, PI)
			set_goal("flee", flee_point(threat.x, threat.y), true)
		was_fleeing = true
		return
	was_fleeing = false
	flee_from = null
	# Départ du fourgon : tout le monde court
	if mission.departing:
		if goal == null or goal.kind != "van":
			g.chatter.say(p, "departure", {}, {"chance": 0.7})
		set_goal("van", van_point())
		return
	# Réanimer un coéquipier
	var downed = g.players.values().filter(func(o): return o.state == "downed" and o != p)
	if downed.size() > 0:
		downed.sort_custom(func(a, b): return dist_to(a.x, a.y) < dist_to(b.x, b.y))
		var o = downed[0]
		var d = dist_to(o.x, o.y)
		var willing = d < 12 + float(pr.loyalty) * 20 and (threat == null or threat.d > 6 or float(pr.loyalty) > 0.9)
		if willing:
			if goal == null or goal.kind != "revive":
				g.chatter.say(p, "teammate_down", {"name": o.name}, {"chance": 0.9})
			set_goal("revive", {"x": o.x, "y": o.y, "id": o.id})
			return
	# Objet porté → fourgon (ou point de contrôle pour le canard)
	if p.carry != "":
		var it = g.items.get(p.carry)
		if it != null and it.type == "duck" and g.quest != null:
			set_goal("quest", {"x": g.quest.x, "y": g.quest.y, "id": ""})
			return
		set_goal("deliver", van_point())
		return
	# Quota atteint : rentrer (prudent) ou continuer (cupide)
	if mission.deposited >= mission.quota:
		if not said_quota:
			said_quota = true
			g.chatter.say(p, "quota", {}, {"force": true})
		var humans_ready = true
		for h in g.humans():
			if h.state == "alive" and not g.in_van(h.x, h.y):
				humans_ready = false
		var want_leave = float(pr.caution) > 0.55 or mission.timeLeft < 100 or float(pr.greed) < 0.4
		if want_leave:
			if (humans_ready and g.in_van(p.x, p.y)) or mission.timeLeft < 45:
				set_goal("lever", g.map.lever)
				return
			set_goal("wait", van_point())
			return
	# Choisir un objet à ramasser
	var item = pick_item()
	if item != null:
		set_goal("loot", {"x": item.x, "y": item.y, "id": item.id})
		return
	# Explorer
	var room = unexplored_room()
	if room != null:
		var pt = g.random_point_in_room(room)
		set_goal("explore", pt if pt != null else Vector2(room.x + room.w / 2.0, room.y + room.h / 2.0))
		return
	set_goal("wait", van_point())


func set_goal(kind: String, pt, force := false) -> void:
	if pt == null:
		return
	var gx = float(pt.x)
	var gy = float(pt.y)
	var gid = ""
	if pt is Dictionary:
		gid = str(pt.get("id", ""))
	if not force and goal != null and goal.kind == kind and goal.id == gid and Vector2(goal.x - gx, goal.y - gy).length() < 1.5:
		return
	goal = {"kind": kind, "x": gx, "y": gy, "id": gid}
	path = null
	goal_t = g.time


func pick_item():
	var pr = prof()
	var best = null
	var bs = 0.0
	for it in g.items.values():
		if it.carried_by != "" or it.def.get("noLoot", false) or it.fall_t > 0:
			continue
		if g.in_van(it.x, it.y):
			continue
		if it.claimed_by != "" and it.claimed_by != p.id and g.players.has(it.claimed_by) and g.players[it.claimed_by].state == "alive":
			continue
		if failed.has(it.id):
			continue
		var d = dist_to(it.x, it.y)
		if d > 45:
			continue
		var room = g.room_at(it.x, it.y)
		if room != null and room.secret:
			continue
		# un bot ne connaît que les objets des salles qu'il a explorées (ou vus de près)
		if room != null and not explored.has(room.id) and d > 6:
			continue
		var value = float(it.value)
		if it.type == "duck" and g.quest != null:
			value = float(g.quest.reward)
		if g.customer != null and it.type == g.customer.type:
			value *= 2
		var s = (value * (0.5 + float(pr.greed))) / (6 + d * (1.5 - float(pr.bravery) * 0.5))
		if it.weight() >= 4:
			s *= 0.5 + float(pr.bravery) * 0.3
		for k in known.values():
			if Vector2(k.x - it.x, k.y - it.y).length() < 6:
				s *= 0.2 + float(pr.bravery) * 0.5
		if s > bs:
			bs = s
			best = it
	if best != null:
		best.claimed_by = p.id
	return best


func unexplored_room():
	var best = null
	var bd = INF
	for r in g.map.rooms:
		if r.secret or explored.has(r.id):
			continue
		var d = dist_to(r.x + r.w / 2.0, r.y + r.h / 2.0) * (0.6 + float(r.danger) * float(prof().caution))
		if d < bd:
			bd = d
			best = r
	return best


func near_locker(max_d: float):
	var best = null
	var bd = max_d
	for l in g.map.lockers:
		if g.locker_occupants(l.id).size() >= 2:
			continue
		var d = dist_to(l.x, l.y)
		if d < bd:
			bd = d
			best = l
	return best


func flee_point(mx: float, my: float):
	var best = null
	var bs = -INF
	var away = atan2(p.y - my, p.x - mx)
	for r in g.map.rooms:
		if r.secret:
			continue
		var cx = r.x + r.w / 2.0
		var cy = r.y + r.h / 2.0
		var dm = Vector2(cx - mx, cy - my).length()
		var dp = dist_to(cx, cy)
		if dp < 2:
			continue
		var dir_ok = absf(angle_difference(away, atan2(cy - p.y, cx - p.x))) < 1.6
		var s = dm - dp * 0.45 + (6.0 if dir_ok else -6.0) + (3.0 * float(prof().caution) if r.start else 0.0)
		if s > bs:
			bs = s
			var pt = g.random_point_in_room(r)
			best = pt if pt != null else Vector2(cx, cy)
	return best


func van_point() -> Vector2:
	var v = g.map.van
	var digits = ""
	for c in str(p.id):
		if c >= "0" and c <= "9":
			digits += c
	var n = int(digits) if digits != "" else 0
	return Vector2(v.x + 0.8 + (n % 4) * (v.w - 1.6) / 3.0, v.y + 0.5 + ((n >> 2) % 2) * (v.h - 1) * 0.6)


func nearest_teammate_or_van() -> Vector2:
	var best = van_point()
	var bd = dist_to(best.x, best.y)
	for o in g.players.values():
		if o == p or o.state != "alive":
			continue
		var d = dist_to(o.x, o.y)
		if d < bd:
			bd = d
			best = Vector2(o.x, o.y)
	return best


func ghost_wander() -> void:
	if goal == null or dist_to(goal.x, goal.y) < 1:
		var ps = g.alive_players()
		if ps.size() > 0:
			var t = g.rng.pick(ps)
			goal = {"kind": "ghost", "x": t.x + g.rng.range_f(-3, 3), "y": t.y + g.rng.range_f(-3, 3), "id": ""}
		else:
			goal = {"kind": "ghost", "x": float(g.map.spawn.x), "y": float(g.map.spawn.y), "id": ""}
	if g.rng.chance(0.01):
		g.boo(p)


# ---------------------------------------------------------------- EXÉCUTION
func set_input(mx: float, my: float, mode: String) -> void:
	input_mx = mx
	input_my = my
	input_mode = mode


func execute(dt: float) -> void:
	var pr = prof()
	var mx = 0.0
	var my = 0.0
	var mode = "walk"
	var gl = goal
	if p.hidden != 0:
		set_input(0, 0, "walk")
		return
	# pause « humaine » : il regarde autour de lui (sauf en fuite / départ)
	if pause_until > g.time and gl != null and not ["flee", "van", "hide", "revive"].has(gl.kind):
		p.angle += sin(g.time * 1.7 + p.x) * dt * 1.5
		set_input(0, 0, "walk")
		return
	if gl != null:
		var d = dist_to(gl.x, gl.y)
		var arrive_d = float(ARRIVE.get(gl.kind, 0.8))
		if gl.kind == "revive" or gl.kind == "hide" or gl.kind == "lever":
			arrive_d = g.S("interactRange") * 0.8
		if gl.kind == "loot":
			var it = g.items.get(gl.id)
			if it == null or it.carried_by != "":
				goal = null
				decide_t = 0.0
			else:
				gl.x = it.x
				gl.y = it.y
		if gl.kind == "revive":
			var o = g.players.get(gl.id)
			if o == null or o.state != "downed":
				stop_hold()
				goal = null
				decide_t = 0.0
			else:
				gl.x = o.x
				gl.y = o.y
		if goal != null and d > arrive_d:
			var wp = next_waypoint(gl, dt)
			var a = atan2(wp.y - p.y, wp.x - p.x)
			mx = cos(a)
			my = sin(a)
			if holding:
				stop_hold()
		elif goal != null:
			arrive(gl)
		if gl.kind == "flee" or gl.kind == "van" or gl.kind == "hide":
			mode = "sprint"
		elif gl.kind != "crawl":
			var near = false
			for k in known.values():
				if dist_to(k.x, k.y) < 10:
					near = true
			if near and float(pr.caution) > 0.4:
				mode = "sneak"
			if gl.kind == "revive" and d > 4:
				mode = "sprint"
			if gl.kind == "deliver" and float(pr.caution) < 0.3 and d > 10 and p.carry == "":
				mode = "sprint"
	if panic_t > g.time:
		mx = cos(panic_dir)
		my = sin(panic_dir)
		mode = "sprint"
	if p.stamina < 0.15 and mode == "sprint":
		mode = "walk"
	# orientation (et donc la lampe)
	var aim_a: float
	if aim_at != null:
		aim_a = atan2(aim_at.y - p.y, aim_at.x - p.x)
	elif mx != 0 or my != 0:
		aim_a = atan2(my, mx)
	else:
		aim_a = p.angle + sin(g.time * 0.7 + p.x) * 0.02
	p.angle = SimMonster.turn_toward(p.angle, aim_a, 7 * dt)
	p.move_mode = mode
	set_input(mx, my, mode)
	# blocage
	var moved = Vector2(p.x - last_pos.x, p.y - last_pos.y).length()
	if (mx != 0 or my != 0) and moved < 0.01:
		stuck_t += dt
		if stuck_t > 1.2:
			path = null
			stuck_t = 0.0
			stuck_count += 1
			try_open_door()
		if stuck_count > 4 and goal != null:
			failed[goal.id] = true
			goal = null
			stuck_count = 0
			decide_t = 0.0
	else:
		stuck_t = 0.0
		if moved > 0.05:
			stuck_count = 0
	last_pos = Vector2(p.x, p.y)
	# bavardages
	if g.time > idle_t:
		idle_t = g.time + g.rng.range_f(20, 40)
		if (float(pr.panic) > 0.8 or float(pr.clumsy) > 0.8) and g.rng.chance(0.35):
			g.chatter.say(p, "wrong_info", {}, {"chance": 1.0})
		else:
			g.chatter.say(p, "idle", {}, {"chance": 0.6})


func avoid_cost(tx: int, ty: int) -> float:
	var c = 0.0
	for k in known.values():
		var d = Vector2(tx + 0.5 - k.x, ty + 0.5 - k.y).length()
		if d < 4:
			c += (4 - d) * 2
	return c


func next_waypoint(gl: Dictionary, dt: float) -> Vector2:
	repath_t -= dt
	if path == null or repath_t <= 0:
		var avoid = Callable(self, "avoid_cost") if (flee_from != null or known.size() > 0) else Callable()
		var found = Pathfinding.find_path(g.grid, p.x, p.y, gl.x, gl.y, true, 2500, avoid)
		repath_t = 1.0
		if found.is_empty():
			path = null
			repath_t = 0.5
			return Vector2(gl.x, gl.y)
		path = found
	while path.size() > 0 and dist_to(path[0].x, path[0].y) < 0.35:
		path.pop_front()
	if path.is_empty():
		return Vector2(gl.x, gl.y)
	var wp = path[0]
	# ouvrir une porte fermée sur le chemin
	var tx = int(floor(wp.x))
	var ty = int(floor(wp.y))
	var grid = g.grid
	if grid.get_t(tx, ty) == Grid.DOOR and grid.door_open[grid.idx(tx, ty)] == 0 and dist_to(tx + 0.5, ty + 0.5) < g.S("interactRange"):
		g.set_door(tx, ty, true, p.id, 5.0 if p.move_mode == "sprint" else 2.5)
	return wp


func try_open_door() -> void:
	var grid = g.grid
	for dy in range(-1, 2):
		for dx in range(-1, 2):
			var tx = int(floor(p.x)) + dx
			var ty = int(floor(p.y)) + dy
			if grid.get_t(tx, ty) == Grid.DOOR and grid.door_open[grid.idx(tx, ty)] == 0:
				g.set_door(tx, ty, true, p.id, 2.5)


func arrive(gl: Dictionary) -> void:
	var range_i = g.S("interactRange")
	match gl.kind:
		"loot":
			var it = g.items.get(gl.id)
			if it != null and it.carried_by == "" and dist_to(it.x, it.y) < range_i:
				g.grab_item(p, it)
				if p.carry != "":
					g.chatter.say(p, "pickup", {"item": it.def.name, "value": int(round(it.value))}, {"chance": 0.5})
			pause_until = g.time + g.rng.range_f(0.4, 1.8)
			goal = null
			decide_t = 0.0
		"deliver", "quest":
			if p.carry != "":
				var it = g.items.get(p.carry)
				g.drop_carried(p, {"reason": "deliver"})
				if gl.kind == "deliver" and it != null:
					g.chatter.say(p, "deliver", {}, {"chance": 0.4})
			pause_until = g.time + g.rng.range_f(1, 3.5)
			goal = null
			decide_t = 0.0
		"revive":
			if not holding:
				holding = true
				g.interact(p)
				var o = g.players.get(gl.id)
				g.chatter.say(p, "reviving", {"name": o.name if o != null else "quelqu'un"}, {"chance": 0.6})
		"hide":
			for l in g.map.lockers:
				if str(l.id) == gl.id and dist_to(l.x, l.y) < range_i:
					g.enter_locker(p, l)
					g.chatter.say(p, "hide", {}, {"chance": 0.5})
					break
			goal = null
		"lever":
			if not holding and g.mission.deposited >= g.mission.quota and not g.mission.departing:
				holding = true
				g.interact(p)
			if g.mission.departing:
				stop_hold()


func stop_hold() -> void:
	if holding:
		holding = false
		g.release(p)
