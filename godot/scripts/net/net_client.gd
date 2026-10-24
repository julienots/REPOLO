# Connexion au serveur du jeu (le même que la version 2D : server/index.js, WebSocket /ws).
# Messages JSON identiques à la version web : un joueur 3D peut rejoindre un salon créé
# depuis un navigateur ou l'APK 2D, et inversement.
class_name NetClient
extends Node

signal status_changed(status: String)
signal message(msg: Dictionary)

var ws = WebSocketPeer.new()
var url = ""
var state = "idle"        # idle | connecting | open | closed
var queue = []
var token = ""
var code = ""
var join_msg = {}
var retry = 0
var retry_t = 0.0
var ping_t = 0.0
var rtt = 0.0
var closed_by_user = false


# base : « 192.168.1.20:8080 », « http://… », « https://… » → ws(s)://hôte/ws
static func ws_url(base: String) -> String:
	var b = base.strip_edges()
	if b == "":
		return ""
	var secure = b.begins_with("https://") or b.begins_with("wss://")
	b = b.trim_prefix("https://").trim_prefix("http://").trim_prefix("wss://").trim_prefix("ws://")
	b = b.trim_suffix("/")
	if b.ends_with("/ws"):
		b = b.trim_suffix("/ws")
	return ("wss://" if secure else "ws://") + b + "/ws"


func connect_to(base: String) -> void:
	url = ws_url(base)
	closed_by_user = false
	_open()


func _open() -> void:
	ws = WebSocketPeer.new()
	ws.inbound_buffer_size = 1 << 20
	var err = ws.connect_to_url(url)
	state = "connecting" if err == OK else "closed"
	status_changed.emit(state if err == OK else "error")


func send(msg: Dictionary) -> void:
	if msg.t == "create" or msg.t == "join":
		join_msg = msg
	if state == "open" and ws.get_ready_state() == WebSocketPeer.STATE_OPEN:
		ws.send_text(JSON.stringify(msg))
	elif msg.t != "st" and msg.t != "voice" and msg.t != "ping":
		queue.append(msg)


func close() -> void:
	closed_by_user = true
	if ws.get_ready_state() == WebSocketPeer.STATE_OPEN:
		ws.send_text(JSON.stringify({"t": "leave"}))
		ws.close()
	state = "closed"


func _process(delta: float) -> void:
	if state == "idle":
		return
	if state == "closed":
		if not closed_by_user and retry_t > 0:
			retry_t -= delta
			if retry_t <= 0:
				_open()
		return
	ws.poll()
	var rs = ws.get_ready_state()
	if rs == WebSocketPeer.STATE_OPEN:
		if state != "open":
			state = "open"
			retry = 0
			status_changed.emit("open")
			if token != "" and code != "":
				var hello = join_msg.get("hello", {}).duplicate()
				hello.token = token
				ws.send_text(JSON.stringify({"t": "join", "code": code, "hello": hello}))
			for m in queue:
				ws.send_text(JSON.stringify(m))
			queue.clear()
		while ws.get_available_packet_count() > 0:
			var txt = ws.get_packet().get_string_from_utf8()
			var msg = JSON.parse_string(txt)
			if not (msg is Dictionary):
				continue
			if msg.get("t") == "pong":
				rtt = Time.get_ticks_msec() - float(msg.get("c", 0))
				continue
			if msg.get("t") == "welcome":
				token = String(msg.get("token", ""))
				code = String(msg.get("code", ""))
			if msg.get("t") in ["kicked", "left"]:
				closed_by_user = true
			message.emit(msg)
		ping_t -= delta
		if ping_t <= 0:
			ping_t = 2.0
			ws.send_text(JSON.stringify({"t": "ping", "c": Time.get_ticks_msec()}))
	elif rs == WebSocketPeer.STATE_CLOSED:
		state = "closed"
		if closed_by_user:
			status_changed.emit("closed")
		else:
			retry += 1
			if retry > 8:
				closed_by_user = true
				status_changed.emit("lost")
			else:
				retry_t = minf(8.0, 0.5 * pow(2, retry))
				status_changed.emit("reconnecting")
