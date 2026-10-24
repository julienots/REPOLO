# Commandes tactiles (téléphone) : joystick virtuel à gauche (pousser au-delà du cercle =
# courir), glisser à droite pour regarder, gros boutons à droite (action maintenue,
# lancer, objet, lampe, accroupi, pause). Multi-doigts.
class_name TouchControls
extends Control

signal button_pressed(id: String)
signal button_released(id: String)

const JOY_R = 90.0

var move = Vector2.ZERO
var sprint = false
var look_delta = Vector2.ZERO
var joy_finger = -1
var joy_base = Vector2.ZERO
var joy_pos = Vector2.ZERO
var look_finger = -1
var look_last = Vector2.ZERO
var held = {}            # finger -> button id
var buttons = []         # {id, label, pos (relatif au coin bas droit), r}
var toggles = {"crouch": false}
var look_sens = 0.0045


func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	buttons = [
		{"id": "action", "label": "ACTION", "pos": Vector2(-120, -130), "r": 62.0},
		{"id": "throw", "label": "LANCER", "pos": Vector2(-255, -75), "r": 44.0},
		{"id": "use", "label": "OBJET", "pos": Vector2(-255, -205), "r": 40.0},
		{"id": "light", "label": "LAMPE", "pos": Vector2(-120, -280), "r": 40.0},
		{"id": "crouch", "label": "ACCROUPI", "pos": Vector2(-385, -140), "r": 44.0},
		{"id": "pause", "label": "II", "pos": Vector2(-60, 0), "r": 30.0},
	]


func _btn_center(b: Dictionary) -> Vector2:
	var vs = get_viewport_rect().size
	if b.id == "pause":
		return Vector2(vs.x + b.pos.x, 50)
	return vs + b.pos


func _hit_button(pos: Vector2):
	for b in buttons:
		if pos.distance_to(_btn_center(b)) <= b.r * 1.15:
			return b
	return null


func _input(event: InputEvent) -> void:
	if not visible:
		return
	var vs = get_viewport_rect().size
	if event is InputEventScreenTouch:
		var idx = event.index
		if event.pressed:
			var b = _hit_button(event.position)
			if b != null:
				held[idx] = b.id
				if toggles.has(b.id):
					toggles[b.id] = not toggles[b.id]
				button_pressed.emit(b.id)
			elif event.position.x < vs.x * 0.42 and joy_finger == -1:
				joy_finger = idx
				joy_base = event.position
				joy_pos = event.position
			elif look_finger == -1:
				look_finger = idx
				look_last = event.position
			get_viewport().set_input_as_handled()
		else:
			if held.has(idx):
				button_released.emit(held[idx])
				held.erase(idx)
			if idx == joy_finger:
				joy_finger = -1
				move = Vector2.ZERO
				sprint = false
			if idx == look_finger:
				look_finger = -1
		queue_redraw()
	elif event is InputEventScreenDrag:
		var idx = event.index
		if idx == joy_finger:
			joy_pos = event.position
			var v = (joy_pos - joy_base) / JOY_R
			sprint = v.length() > 1.25
			move = v.limit_length(1.0)
			queue_redraw()
			get_viewport().set_input_as_handled()
		elif idx == look_finger:
			look_delta += (event.position - look_last) * look_sens
			look_last = event.position
			get_viewport().set_input_as_handled()


func take_look() -> Vector2:
	var d = look_delta
	look_delta = Vector2.ZERO
	return d


func _draw() -> void:
	var font = get_theme_default_font()
	if joy_finger != -1:
		draw_circle(joy_base, JOY_R, Color(1, 1, 1, 0.08))
		draw_arc(joy_base, JOY_R, 0, TAU, 48, Color(1, 1, 1, 0.3), 2.0)
		draw_arc(joy_base, JOY_R * 1.25, 0, TAU, 48, Color(1, 0.6, 0.3, 0.25), 1.5)
		draw_circle(joy_base + move * JOY_R, 34, Color(1, 1, 1, 0.35 if not sprint else 0.55))
	else:
		var vs = get_viewport_rect().size
		var hint = Vector2(150, vs.y - 150)
		draw_arc(hint, JOY_R, 0, TAU, 48, Color(1, 1, 1, 0.12), 2.0)
	for b in buttons:
		var c = _btn_center(b)
		var on = held.values().has(b.id) or toggles.get(b.id, false)
		draw_circle(c, b.r, Color(1, 1, 1, 0.22 if on else 0.1))
		draw_arc(c, b.r, 0, TAU, 40, Color(1, 1, 1, 0.45), 2.0)
		var fs = 15 if b.r > 35 else 13
		var w = font.get_string_size(b.label, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
		draw_string(font, c + Vector2(-w / 2, fs * 0.35), b.label, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color(1, 1, 1, 0.85))
