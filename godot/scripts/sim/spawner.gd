# Composition et apparition des créatures (port de shared/sim/spawner.js) :
# jamais en vue d'un joueur, jamais à moins de 14 cases, apparitions échelonnées.
class_name SimSpawner
extends RefCounted

var game
var queue = []
var next_t = 12.0
var spawned = []


func _init(g, mission: Dictionary, diff: Dictionary, forced: Array) -> void:
	game = g
	queue = forced.duplicate() if forced.size() > 0 else compose(mission, diff)


func compose(mission: Dictionary, diff: Dictionary) -> Array:
	var g = game
	var db = Data.db.MONSTERS
	var pool = mission.monsterPool.filter(func(id): return db.has(id) and float(db[id].minDifficulty) <= float(diff.level))
	var chosen = []
	var budget = float(diff.monsterBudget)
	for id in mission.get("required", []):
		if db.has(id):
			chosen.append(id)
			budget -= float(db[id].cost)
	var rest = g.rng.shuffle(pool.filter(func(id): return not chosen.has(id)))
	for id in rest:
		if chosen.size() >= int(diff.maxMonsters):
			break
		if float(db[id].cost) <= budget:
			chosen.append(id)
			budget -= float(db[id].cost)
	return chosen


func update() -> void:
	var g = game
	if queue.is_empty() or g.time < next_t:
		return
	if g.director.phase == "peak":
		next_t = g.time + 5.0
		return
	var type = queue.pop_front()
	if spawn(type) == null:
		queue.push_front(type)
		next_t = g.time + 3.0
		return
	next_t = g.time + g.rng.range_f(30, 55)


func spawn(type: String):
	var g = game
	if not Data.db.MONSTERS.has(type):
		return null
	var rooms = g.map.rooms.filter(func(r): return not r.start and not r.secret and r.danger > 0.35)
	var ordered = g.rng.shuffle(rooms.duplicate())
	ordered = MapGen._stable_sort(ordered, func(a, b): return b.danger - a.danger)
	for room in ordered:
		for _t in 8:
			var pt = g.random_point_in_room(room)
			if pt == null:
				continue
			var unsafe = false
			for p in g.players.values():
				if p.state != "dead" and (Vector2(p.x - pt.x, p.y - pt.y).length() < 14 or g.grid.has_los(p.x, p.y, pt.x, pt.y)):
					unsafe = true
			if unsafe:
				continue
			var used = {}
			for m in g.monsters:
				used[m.lair.id] = true
			var lair = room
			for r in rooms:
				if not used.has(r.id) and r.danger > 0.5:
					lair = r
					break
			var m = SimMonster.new(g, type, pt.x, pt.y, lair)
			g.monsters.append(m)
			spawned.append(type)
			return m
	return null


func spawn_extra():
	var g = game
	if g.monsters.size() >= int(g.diff.maxMonsters) + 1:
		return null
	var pool = []
	for id in Data.db.MONSTERS.keys():
		var present = false
		for m in g.monsters:
			if m.type == id:
				present = true
		if not present and float(Data.db.MONSTERS[id].minDifficulty) <= float(g.diff.level):
			pool.append(id)
	return spawn(g.rng.pick(pool) if not pool.is_empty() else "sourdine")
