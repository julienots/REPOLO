# Tests de la simulation GDScript : parties complètes jouées par des bots, chaque créature,
# chaque événement, construction du résultat. Toute erreur de script fait échouer la CI.
extends RefCounted

const PROFILES = ["prudent", "courageux", "panique", "cupide", "protecteur", "comique"]

var runner


func _init(r) -> void:
	runner = r


func make_game(seed: int, nbots := 4, monsters := [], mission := "morvan", difficulty := "employe") -> GameSim:
	var players = []
	for i in nbots:
		players.append({"id": "b%d" % i, "name": "Bot%d" % i, "isBot": true, "botProfile": PROFILES[i % PROFILES.size()]})
	return GameSim.new({"seed": seed, "players": players, "monsters": monsters, "missionId": mission, "difficulty": difficulty, "variant": "standard"})


func run(g: GameSim, seconds: float, dt := 1.0 / 20.0) -> void:
	var snap_t = 0.0
	while not g.mission.ended and g.time < seconds:
		g.step(dt)
		snap_t += dt
		if snap_t >= 0.1:
			snap_t = 0.0
			g.snapshot()


func timeline(g: GameSim) -> String:
	var mons = []
	for m in g.monsters:
		mons.append("%s:%s" % [m.type, m.state])
	var ps = []
	for p in g.players.values():
		ps.append("%s:%s%d%s" % [p.name, p.state.substr(0, 1), p.hp, "*" if p.carry != "" else ""])
	return "t=%ds dep=%d/%d items=%d mon=%s tension=%.2f %s | %s" % [int(g.time), int(g.mission.deposited), int(g.mission.quota), g.items.size(), ",".join(mons), g.director.tension, g.director.phase, " ".join(ps)]


# Empreinte compacte de l'état (comparée ligne à ligne avec la version web)
func trace(g: GameSim) -> String:
	var parts = ["%d" % int(round(g.time))]
	for p in g.players.values():
		parts.append("%.2f,%.2f,%s" % [p.x, p.y, p.state.substr(0, 1)])
	for m in g.monsters:
		parts.append("%s:%.2f,%.2f,%s" % [m.type.substr(0, 3), m.x, m.y, m.state])
	parts.append("ev%d" % g.director.history.size())
	return " ".join(parts)


func test_bot_game() -> void:
	var t0 = Time.get_ticks_msec()
	var g = make_game(1234)
	var start = {}
	for p in g.players.values():
		start[p.id] = Vector2(p.x, p.y)
	# même pas de temps que scripts/simulate.mjs pour comparer les deux versions
	var dt = 1.0 / 30.0
	var next_report = 0.0
	while not g.mission.ended and g.time < 300.0:
		g.step(dt)
		if g.time >= next_report:
			next_report += 30.0
			print("    ", timeline(g))
		var snap = g.snapshot()
		for m in snap.msgs:
			if m.k == "announce" and m.kind in ["death", "down"]:
				print("      [%ds] %s" % [int(g.time), m.text])
	var moved = 0
	var noise = 0.0
	for p in g.players.values():
		if Vector2(p.x, p.y).distance_to(start[p.id]) > 3 or p.state != "alive":
			moved += 1
		noise += p.stats.noise
	runner.check("partie de bots : les bots se déplacent (%d/4)" % moved, moved >= 3)
	runner.check("partie de bots : des créatures sont apparues (%d)" % g.monsters.size(), g.monsters.size() > 0)
	runner.check("partie de bots : du butin est ramené (%d cr)" % int(g.mission.deposited), g.mission.deposited > 0, "quota %d" % int(g.mission.quota))
	runner.check("partie de bots : les bots font du bruit", noise > 0)
	print("    (%d s simulées en %d ms réelles, fin : %s)" % [int(g.time), Time.get_ticks_msec() - t0, g.mission.endReason])


# Mêmes graines que scripts/simulate (version web : 4 réussites sur 8, 4 équipes à terre).
# Le comportement exact diverge (calcul flottant), on compare donc l'équilibre global.
func test_balance_seeds() -> void:
	var wins = 0
	var lines = []
	for seed in [11, 22, 33, 44, 55, 66, 77, 88]:
		var g = make_game(seed)
		while not g.mission.ended and g.time < 900.0:
			g.step(1.0 / 20.0)
			g.snapshot()
		var alive = 0
		var hits = 0
		for p in g.players.values():
			if p.state != "dead":
				alive += 1
			hits += p.stats.hits
		if g.mission.endReason == "departure" and g.mission.success:
			wins += 1
		lines.append("seed=%d fin=%s t=%d dep=%d/%d survivants=%d coups=%d" % [seed, g.mission.endReason, int(g.time), int(g.mission.deposited), int(g.mission.quota), alive, hits])
	for l in lines:
		print("    ", l)
	runner.check("équilibre : des équipes de bots réussissent la mission (%d/8)" % wins, wins >= 2)


func test_every_monster() -> void:
	var ok = true
	var detail = ""
	for type in Data.db.MONSTERS.keys():
		var g = make_game(77, 3, [type])
		g.spawner.next_t = 0.0
		g.time = 25.0
		run(g, 110.0)
		var found = false
		for m in g.monsters:
			if m.type == type:
				found = true
				var s = m.snapshot()
				if s.k != type:
					ok = false
		if not found:
			ok = false
			detail += type + " absent ; "
	runner.check("chaque créature apparaît et agit 85 s sans erreur", ok, detail)


func test_every_event() -> void:
	var g = make_game(99, 4, ["sourdine", "demenageur"])
	g.time = 30.0
	var started = 0
	for def in Data.db.EVENTS:
		g.director.cooldowns.clear()
		if g.director.force_start(def.id):
			started += 1
		run(g, g.time + 2.0)
		if g.mission.ended:
			break
	runner.check("événements déclenchables (%d/27)" % started, started >= 20)


func test_result() -> void:
	var g = make_game(5, 2)
	run(g, 20.0)
	g.finish("time")
	var r = g.result
	runner.check("résultat de mission construit", r.has("players") and r.players.size() == 2 and r.has("awards"))


func test_snapshot_format() -> void:
	var g = make_game(8, 2, ["inspecteur"])
	g.spawner.next_t = 0.0
	g.time = 25.0
	run(g, 40.0)
	var s = g.snapshot()
	runner.check("instantané au format du serveur", s.has("players") and s.has("monsters") and s.has("items"), str(s.keys()))
