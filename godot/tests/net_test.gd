# Test réseau réel : deux clients Godot se connectent au serveur Node du jeu (celui de la
# version web), créent / rejoignent un salon par code, lancent une mission avec bots,
# reçoivent les instantanés et se voient bouger. Lancé en CI : serveur sur 127.0.0.1:8080.
extends Node

var host: NetClient
var guest: NetClient
var host_state: ClientState
var guest_state: ClientState
var host_id = ""
var guest_id = ""
var code = ""
var snaps_host = 0
var snaps_guest = 0
var phase = "connect"
var t = 0.0
var start_pos = Vector2.ZERO
var ok = {}
var server = "127.0.0.1:8080"


func _ready() -> void:
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--server="):
			server = a.substr(9)
	host = NetClient.new()
	add_child(host)
	host.message.connect(_on_host)
	host.connect_to(server)
	host.send({"t": "create", "hello": {"name": "Hôte 3D", "platform": "pc", "equipment": "radio"}})
	print("connexion à ", NetClient.ws_url(server))


func _on_host(msg: Dictionary) -> void:
	match msg.t:
		"welcome":
			host_id = msg.you
			code = msg.code
			ok["salon créé (code %s)" % code] = true
			host.send({"t": "settings", "fillBots": true, "teamSize": 4, "difficulty": "stagiaire", "variant": "standard"})
			guest = NetClient.new()
			add_child(guest)
			guest.message.connect(_on_guest)
			guest.connect_to(server)
			guest.send({"t": "join", "code": code, "hello": {"name": "Invité 3D", "platform": "mobile", "equipment": "decoy"}})
		"lobby":
			if phase == "connect" and msg.members.size() == 2:
				phase = "lobby"
				ok["le second joueur apparaît dans le salon"] = true
				guest.send({"t": "ready", "v": true})
				host.send({"t": "start", "seed": 4242, "force": true})
		"start":
			host_state = ClientState.new(host, msg.info, msg.you)
			ok["mission lancée, carte reçue (%dx%d)" % [host_state.map.w, host_state.map.h]] = true
			var local = MapGen.generate(host_state.map.theme, int(host_state.map.seed))
			ok["carte du serveur identique à la génération Godot"] = local.grid.tiles == host_state.grid.tiles
		"snap":
			snaps_host += 1
		"error":
			print("erreur serveur : ", msg.msg)


func _on_guest(msg: Dictionary) -> void:
	match msg.t:
		"welcome":
			guest_id = msg.you
			ok["salon rejoint par son code"] = true
		"start":
			guest_state = ClientState.new(guest, msg.info, msg.you)
		"snap":
			snaps_guest += 1


func _process(delta: float) -> void:
	t += delta
	if host_state != null and guest_state != null:
		host_state.snapshot()
		guest_state.snapshot()
		var me = host_state.me()
		if phase == "lobby" and snaps_host > 20:
			phase = "move"
			start_pos = Vector2(me.x, me.y)
		if phase == "move":
			# l'hôte marche (prédiction locale + envoi au serveur)
			var dirs = [Vector2(1, 0), Vector2(0, 1), Vector2(-1, 0), Vector2(0, -1)]
			var d = dirs[int(t) % 4]
			host_state.step_movement(me, d.x, d.y, "walk", {}, delta)
			host_state.step(delta)
			if t > 10.0:
				phase = "check"
		if phase == "check":
			var seen = guest_state.players.get(host_id)
			var moved = seen != null and Vector2(seen.x, seen.y).distance_to(start_pos) > 0.8
			ok["l'invité voit l'hôte se déplacer (instantanés du serveur)"] = moved
			ok["instantanés reçus (%d / %d)" % [snaps_host, snaps_guest]] = snaps_host > 60 and snaps_guest > 60
			var bots = 0
			for p in host_state.players.values():
				if p.is_bot:
					bots += 1
			ok["bots ajoutés par le serveur (%d)" % bots] = bots >= 2
			_finish()
	if t > 40.0:
		ok["délai dépassé (phase %s)" % phase] = false
		_finish()


func _finish() -> void:
	var failed = 0
	for k in ok:
		print("  ", "✔ " if ok[k] else "✖ ", k)
		if not ok[k]:
			failed += 1
	print("=== réseau : %d réussis, %d échoués ===" % [ok.size() - failed, failed])
	host.close()
	if guest:
		guest.close()
	set_process(false)
	get_tree().quit(1 if failed > 0 else 0)
