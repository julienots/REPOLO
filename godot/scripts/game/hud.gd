# Interface en jeu : quota et chrono, événements actifs, PV / endurance / batterie,
# invite d'action sous le viseur, jauge de canalisation (réanimation, levier), annonces,
# sous-titres des voix (bots, créatures, imitations), équipe, voile « casier ».
class_name Hud
extends Control

var top_label: Label
var quota_bar: ProgressBar
var time_label: Label
var events_label: Label
var stats_box: VBoxContainer
var hp_label: Label
var stamina_bar: ProgressBar
var battery_bar: ProgressBar
var equip_label: Label
var prompt: Label
var channel_bar: ProgressBar
var crosshair: ColorRect
var feed_box: VBoxContainer
var subs_box: VBoxContainer
var team_label: Label
var center_label: Label
var locker_overlay: Control
var vignette_red: ColorRect
var feed_items = []
var sub_items = []
var center_t = 0.0
var font_size = 18


# Ajoute (si besoin) puis ancre un élément : l'ancrage doit se faire une fois dans l'arbre.
func place(c: Control, preset: int, off: Vector2, size: Vector2) -> void:
	if c.get_parent() == null:
		add_child(c)
	c.set_anchors_preset(preset)
	c.offset_left = off.x
	c.offset_top = off.y
	c.offset_right = off.x + size.x
	c.offset_bottom = off.y + size.y


static func _style_bar(bar: ProgressBar, col: Color) -> void:
	var bg = StyleBoxFlat.new()
	bg.bg_color = Color(0, 0, 0, 0.55)
	bg.set_corner_radius_all(3)
	var fg = StyleBoxFlat.new()
	fg.bg_color = col
	fg.set_corner_radius_all(3)
	bar.add_theme_stylebox_override("background", bg)
	bar.add_theme_stylebox_override("fill", fg)
	bar.show_percentage = false


func _label(text: String, size: int, col := Color(0.92, 0.9, 0.85)) -> Label:
	var l = Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", col)
	l.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.9))
	l.add_theme_constant_override("shadow_offset_x", 2)
	l.add_theme_constant_override("shadow_offset_y", 2)
	return l


func build(mobile: bool) -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	font_size = 20 if mobile else 18
	# voile du casier : fentes d'aération
	locker_overlay = Control.new()
	locker_overlay.set_anchors_preset(Control.PRESET_FULL_RECT)
	locker_overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(locker_overlay)
	var slots = VBoxContainer.new()
	slots.set_anchors_preset(Control.PRESET_FULL_RECT)
	slots.add_theme_constant_override("separation", 0)
	locker_overlay.add_child(slots)
	for i in 12:
		var bar = ColorRect.new()
		bar.color = Color(0.01, 0.01, 0.012, 1.0) if i % 2 == 0 or i < 3 or i > 8 else Color(0, 0, 0, 0)
		bar.size_flags_vertical = Control.SIZE_EXPAND_FILL
		bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
		slots.add_child(bar)
	locker_overlay.visible = false
	vignette_red = ColorRect.new()
	vignette_red.set_anchors_preset(Control.PRESET_FULL_RECT)
	vignette_red.color = Color(0.6, 0, 0, 0)
	vignette_red.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(vignette_red)
	# haut gauche : mission
	var tl = VBoxContainer.new()
	tl.position = Vector2(18, 14)
	tl.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(tl)
	top_label = _label("", font_size)
	tl.add_child(top_label)
	quota_bar = ProgressBar.new()
	quota_bar.custom_minimum_size = Vector2(300, 12)
	_style_bar(quota_bar, Color(0.95, 0.65, 0.2))
	tl.add_child(quota_bar)
	time_label = _label("", font_size + 4)
	tl.add_child(time_label)
	events_label = _label("", font_size - 3, Color(1.0, 0.75, 0.5))
	tl.add_child(events_label)
	# bas gauche : état
	stats_box = VBoxContainer.new()
	place(stats_box, Control.PRESET_BOTTOM_LEFT, Vector2(18, -150), Vector2(240, 130))
	stats_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if mobile:
		# sur téléphone, le joystick occupe le bas gauche : l'état passe en haut à droite
		place(stats_box, Control.PRESET_TOP_RIGHT, Vector2(-330, 14), Vector2(240, 130))
	hp_label = _label("", font_size + 2, Color(1.0, 0.35, 0.3))
	stats_box.add_child(hp_label)
	stamina_bar = ProgressBar.new()
	stamina_bar.custom_minimum_size = Vector2(200, 9)
	stamina_bar.max_value = 1.0
	_style_bar(stamina_bar, Color(0.4, 0.85, 0.5))
	stats_box.add_child(stamina_bar)
	battery_bar = ProgressBar.new()
	battery_bar.custom_minimum_size = Vector2(200, 9)
	battery_bar.max_value = 1.0
	_style_bar(battery_bar, Color(1.0, 0.9, 0.5))
	stats_box.add_child(battery_bar)
	equip_label = _label("", font_size - 3, Color(0.8, 0.85, 0.9))
	stats_box.add_child(equip_label)
	# viseur + invite + jauge
	crosshair = ColorRect.new()
	crosshair.color = Color(1, 1, 1, 0.55)
	place(crosshair, Control.PRESET_CENTER, Vector2(-2, -2), Vector2(4, 4))
	crosshair.mouse_filter = Control.MOUSE_FILTER_IGNORE
	prompt = _label("", font_size)
	prompt.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	place(prompt, Control.PRESET_CENTER, Vector2(-320, 26), Vector2(640, 30))
	channel_bar = ProgressBar.new()
	place(channel_bar, Control.PRESET_CENTER, Vector2(-110, 62), Vector2(220, 10))
	channel_bar.max_value = 1.0
	_style_bar(channel_bar, Color(0.3, 0.9, 1.0))
	channel_bar.visible = false
	center_label = _label("", font_size + 10, Color(1.0, 0.85, 0.75))
	center_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	center_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	place(center_label, Control.PRESET_CENTER, Vector2(-420, -170), Vector2(840, 120))
	# annonces (haut centre)
	feed_box = VBoxContainer.new()
	place(feed_box, Control.PRESET_CENTER_TOP, Vector2(-330, 110), Vector2(660, 200))
	feed_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	# sous-titres (bas centre)
	subs_box = VBoxContainer.new()
	place(subs_box, Control.PRESET_CENTER_BOTTOM, Vector2(-380, -200 if mobile else -160), Vector2(760, 130))
	subs_box.alignment = BoxContainer.ALIGNMENT_END
	subs_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	# équipe (bas droite / haut droite sous l'état en mobile)
	team_label = _label("", font_size - 4, Color(0.85, 0.85, 0.85))
	if mobile:
		place(team_label, Control.PRESET_TOP_RIGHT, Vector2(-330, 130), Vector2(240, 120))
	else:
		place(team_label, Control.PRESET_BOTTOM_RIGHT, Vector2(-250, -130), Vector2(240, 120))


func feed(text: String, kind := "info") -> void:
	var col = Color(0.95, 0.92, 0.85)
	match kind:
		"event", "warn":
			col = Color(1.0, 0.6, 0.25)
		"down", "death", "danger":
			col = Color(1.0, 0.35, 0.3)
		"success", "revive":
			col = Color(0.5, 1.0, 0.6)
		"funny", "secret":
			col = Color(0.9, 0.7, 1.0)
		"private":
			col = Color(0.7, 0.9, 1.0)
	var l = _label(text, font_size - 1, col)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.custom_minimum_size = Vector2(660, 0)
	feed_box.add_child(l)
	feed_items.append({"node": l, "t": 6.0})
	while feed_items.size() > 5:
		feed_items.pop_front().node.queue_free()


func subtitle(speaker: String, text: String, kind: String, dist01: float) -> void:
	var col = Color(1, 1, 1)
	match kind:
		"monster":
			col = Color(1.0, 0.3, 0.25)
		"mimic":
			col = Color(0.75, 0.75, 0.8)
		"rescuer":
			col = Color(0.5, 1.0, 0.55)
		"bot", "disguised":
			col = Color(0.95, 0.95, 0.9)
		"ghost":
			col = Color(0.6, 0.8, 1.0)
	col.a = clampf(1.15 - dist01, 0.35, 1.0)
	var l = _label("%s : %s" % [speaker, text] if speaker != "" else text, font_size - 1, col)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.custom_minimum_size = Vector2(760, 0)
	subs_box.add_child(l)
	sub_items.append({"node": l, "t": clampf(2.0 + text.length() / 14.0, 2.5, 6.0)})
	while sub_items.size() > 4:
		sub_items.pop_front().node.queue_free()


func flash_center(text: String, dur := 3.0) -> void:
	center_label.text = text
	center_t = dur


func tick(dt: float) -> void:
	for arr in [feed_items, sub_items]:
		for it in arr.duplicate():
			it.t -= dt
			if it.t < 1.0:
				it.node.modulate.a = maxf(0.0, it.t)
			if it.t <= 0:
				it.node.queue_free()
				arr.erase(it)
	center_t -= dt
	center_label.modulate.a = clampf(center_t, 0.0, 1.0)


static func fmt_time(sec: float) -> String:
	var s = maxi(0, int(sec))
	return "%d:%02d" % [s / 60, s % 60]


func update_state(snap: Dictionary, me: Dictionary, mission_name: String, roster: Dictionary, prompt_text: String) -> void:
	var m = snap.mission
	top_label.text = "%s — butin chargé : %d / %d cr" % [mission_name, int(m.d), int(m.q)]
	quota_bar.max_value = maxf(1.0, float(m.q))
	quota_bar.value = minf(float(m.d), float(m.q))
	var tl = float(m.tl)
	if float(m.dep) >= 0:
		time_label.text = "DÉPART DU FOURGON : %.0f s — MONTEZ !" % float(m.dep)
		time_label.add_theme_color_override("font_color", Color(1.0, 0.4, 0.3))
	else:
		time_label.text = "Temps restant " + fmt_time(tl)
		time_label.add_theme_color_override("font_color", Color(1.0, 0.4, 0.3) if tl < 60 else Color(0.92, 0.9, 0.85))
	var evs = []
	for e in snap.get("ev", []):
		evs.append("! %s%s" % [e.n, (" (%d s)" % int(e.l)) if int(e.l) > 0 else ""])
	events_label.text = "\n".join(evs)
	var hp = int(me.hp)
	hp_label.text = "SANTÉ " + "■".repeat(maxi(0, hp)) + "□".repeat(maxi(0, 3 - hp))
	stamina_bar.value = float(me.s)
	battery_bar.value = float(me.b)
	var eq = Data.db.EQUIPMENT.get(me.eq, {})
	var ch = int(me.get("ch", 0))
	equip_label.text = "Lampe %d %%   %s%s" % [int(float(me.b) * 100), eq.get("name", ""), (" ×%d" % ch) if eq.get("charges") != null else ""]
	prompt.text = prompt_text
	var chan = me.get("chan")
	channel_bar.visible = chan != null
	if chan != null:
		channel_bar.value = float(chan[1])
	locker_overlay.visible = me.get("h") != null
	var st = String(me.st)
	crosshair.visible = st == "alive" and me.get("h") == null
	if st == "downed":
		vignette_red.color = Color(0.45, 0, 0, 0.25 + 0.1 * sin(Time.get_ticks_msec() / 300.0))
		if center_t <= 0:
			center_label.text = "À TERRE — un coéquipier doit vous relever (%d s)" % int(float(me.dn))
			center_label.modulate.a = 1.0
	elif st == "dead":
		vignette_red.color = Color(0.1, 0.2, 0.4, 0.15)
		if center_t <= 0:
			center_label.text = "Vous êtes un fantôme. Action : « Bouh ! »"
			center_label.modulate.a = 0.8
	elif st == "extracted":
		vignette_red.color = Color(0, 0, 0, 0)
		if center_t <= 0:
			center_label.text = "Dans le fourgon. Attente du départ…"
			center_label.modulate.a = 0.9
	else:
		vignette_red.color = Color(0.6, 0, 0, 0.3 if int(me.get("hu", 0)) else 0.0)
	var lines = []
	for p in snap.players:
		var icon = {"alive": "", "downed": "[À TERRE] ", "dead": "[MORT] ", "extracted": "[FOURGON] "}.get(p.st, "")
		var nm = roster.get(p.id, {}).get("name", p.id)
		lines.append("%s%s  %s" % [icon, nm, "■".repeat(maxi(0, int(p.hp)))])
	team_label.text = "\n".join(lines)
