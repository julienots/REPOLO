# Menus de la version 3D : accueil, mission solo (avec bots), personnalisation
# (cosmétiques achetés avec les crédits gagnés), réglages, résultats de mission.
class_name Menu3D
extends Control

signal start_requested(cfg: Dictionary)
signal online_requested(action: String, server: String, code: String)
signal net_send(msg: Dictionary)
signal leave_requested

var mobile = false
var panel: PanelContainer
var content: VBoxContainer
var profile_label: Label
var sel = {"mission": "morvan", "difficulty": "employe", "bots": 3}
var status_label: Label
var lobby_chat_edit: LineEdit


func _ready() -> void:
	mobile = OS.has_feature("mobile")
	theme = UiTheme.make(mobile)
	set_anchors_preset(Control.PRESET_FULL_RECT)
	var shade = ColorRect.new()
	shade.set_anchors_preset(Control.PRESET_FULL_RECT)
	shade.color = Color(0, 0, 0, 0.35)
	shade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(shade)
	var head = VBoxContainer.new()
	head.position = Vector2(40, 30)
	add_child(head)
	head.add_child(UiTheme.title("OPÉRATION PANIQUE", 54 if not mobile else 46))
	head.add_child(UiTheme.label("Version 3D — " + Data.db.GAME.tagline, 18, Color(0.85, 0.8, 0.75)))
	profile_label = UiTheme.label("", 16, Color(0.75, 0.85, 0.95))
	head.add_child(profile_label)
	panel = PanelContainer.new()
	panel.position = Vector2(40, 190 if not mobile else 170)
	panel.custom_minimum_size = Vector2(520, 0)
	add_child(panel)
	var scroll = ScrollContainer.new()
	scroll.custom_minimum_size = Vector2(520, 440 if not mobile else 400)
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	panel.add_child(scroll)
	content = VBoxContainer.new()
	content.add_theme_constant_override("separation", 10)
	content.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(content)
	sel.mission = Profile3D.data.last.get("mission", "morvan")
	sel.difficulty = Profile3D.data.last.get("difficulty", "employe")
	sel.bots = int(Profile3D.data.settings.get("bots", 3))
	show_main()


func _refresh_profile() -> void:
	var li = Profile3D.level_info()
	profile_label.text = "%s — niveau %d (%d / %d XP) — %d crédits" % [Profile3D.data.name, li.level, li.into, li.next, int(Profile3D.data.coins)]


func _clear() -> void:
	for c in content.get_children():
		c.queue_free()
	_refresh_profile()


func show_main() -> void:
	_clear()
	content.add_child(UiTheme.button("Mission solo (avec bots)", show_solo))
	content.add_child(UiTheme.button("Multijoueur en ligne (code d'invitation)", show_online))
	content.add_child(UiTheme.button("Personnaliser mon employé", show_custom))
	content.add_child(UiTheme.button("Réglages", show_settings))
	content.add_child(UiTheme.button("Bestiaire", show_bestiary))
	if not mobile:
		content.add_child(UiTheme.button("Quitter", func(): get_tree().quit()))
	content.add_child(UiTheme.label("En ligne, la 3D rejoint les mêmes salons que la version 2D (navigateur / APK) : même serveur, mêmes règles. "
		+ "Le chat vocal n'existe que dans la version 2D ; en 3D votre micro sert uniquement au bruit (les créatures vous entendent).", 14, Color(0.7, 0.7, 0.7)))


func _option(items: Array, current: String, cb: Callable) -> OptionButton:
	var o = OptionButton.new()
	var i = 0
	for it in items:
		o.add_item(it[1])
		o.set_item_metadata(i, it[0])
		if it.size() > 2 and it[2]:
			o.set_item_disabled(i, true)
		if it[0] == current:
			o.select(i)
		i += 1
	o.item_selected.connect(func(idx): cb.call(o.get_item_metadata(idx)))
	o.custom_minimum_size = Vector2(480, 46)
	return o


func show_solo() -> void:
	_clear()
	content.add_child(UiTheme.title("Mission solo", 30))
	var lvl = Profile3D.level_info().level
	var ms = []
	for id in Data.db.MISSIONS:
		var m = Data.db.MISSIONS[id]
		var locked = lvl < int(m.get("unlockLevel", 1))
		ms.append([id, "%s%s" % [m.name, (" (niveau %d)" % int(m.unlockLevel)) if locked else ""], locked])
	content.add_child(UiTheme.label("Lieu", 16))
	content.add_child(_option(ms, sel.mission, _set_mission))
	var brief = UiTheme.label("", 15, Color(0.8, 0.78, 0.72))
	brief.name = "Brief"
	brief.custom_minimum_size = Vector2(480, 0)
	content.add_child(brief)
	var ds = []
	for id in Data.db.DIFFICULTIES:
		ds.append([id, "%s — %s" % [Data.db.DIFFICULTIES[id].name, Data.db.DIFFICULTIES[id].desc]])
	content.add_child(UiTheme.label("Difficulté", 16))
	content.add_child(_option(ds, sel.difficulty, _set_difficulty))
	content.add_child(UiTheme.label("Coéquipiers bots", 16))
	content.add_child(_option([["0", "Aucun (seul dans le noir)"], ["1", "1 bot"], ["2", "2 bots"], ["3", "3 bots"]], str(sel.bots), _set_bots))
	var eqs = []
	for id in Data.db.EQUIPMENT:
		var e = Data.db.EQUIPMENT[id]
		var locked = lvl < int(e.get("unlockLevel", 1))
		eqs.append([id, "%s%s" % [e.name, (" (niveau %d)" % int(e.unlockLevel)) if locked else ""], locked])
	content.add_child(UiTheme.label("Équipement", 16))
	content.add_child(_option(eqs, Profile3D.data.equipment, _set_equipment))
	var start = UiTheme.button("ENTRER DANS LE BÂTIMENT", _start)
	start.add_theme_color_override("font_color", UiTheme.ACCENT)
	content.add_child(start)
	content.add_child(UiTheme.button("Retour", show_main))
	_brief()


func _set_mission(v) -> void:
	sel.mission = v
	_brief()


func _set_difficulty(v) -> void:
	sel.difficulty = v


func _set_bots(v) -> void:
	sel.bots = int(v)


func _set_equipment(v) -> void:
	Profile3D.data.equipment = v
	Profile3D.save()
	_brief()


func _set_name(t: String) -> void:
	Profile3D.data.name = t.strip_edges() if t.strip_edges() != "" else "Employé"
	Profile3D.save()
	_refresh_profile()


# (bind ajoute la clé après la valeur émise par le signal)
func _set_setting(v, key: String) -> void:
	Profile3D.data.settings[key] = v
	Profile3D.save()


func _set_scale(v) -> void:
	Profile3D.data.settings.scale = float(v)
	Profile3D.save()
	get_viewport().scaling_3d_scale = float(v)


func _brief() -> void:
	var b = content.get_node_or_null("Brief")
	if b == null:
		return
	var m = Data.db.MISSIONS[sel.mission]
	var eq = Data.db.EQUIPMENT.get(Profile3D.data.equipment, {})
	b.text = "%s\nÉquipement : %s" % [m.brief, eq.get("desc", "")]


func _start() -> void:
	Profile3D.data.last = {"mission": sel.mission, "difficulty": sel.difficulty}
	Profile3D.data.settings.bots = sel.bots
	Profile3D.save()
	var s = Profile3D.data.settings
	start_requested.emit({
		"mission": sel.mission, "difficulty": sel.difficulty, "bots": sel.bots, "seed": randi() % 2000000000,
		"name": Profile3D.data.name, "cosmetics": Profile3D.data.cosmetics, "equipment": Profile3D.data.equipment,
		"sensitivity": float(s.sensitivity), "volume": float(s.volume), "mic": bool(s.mic), "tts": bool(s.tts), "shadows": bool(s.shadows),
	})


func show_custom() -> void:
	_clear()
	content.add_child(UiTheme.title("Personnalisation", 30))
	content.add_child(UiTheme.label("Purement esthétique : aucun avantage en jeu. Tout se gagne en mission.", 14, Color(0.7, 0.7, 0.7)))
	var name_edit = LineEdit.new()
	name_edit.text = Profile3D.data.name
	name_edit.max_length = 18
	name_edit.custom_minimum_size = Vector2(480, 46)
	name_edit.text_changed.connect(_set_name)
	content.add_child(UiTheme.label("Nom", 16))
	content.add_child(name_edit)
	for slot in [["suit", "Combinaison"], ["mask", "Masque"], ["hat", "Chapeau"], ["light", "Faisceau"]]:
		content.add_child(UiTheme.label(slot[1], 16))
		var row = HFlowContainer.new()
		row.custom_minimum_size = Vector2(480, 0)
		content.add_child(row)
		for it in Data.db.COSMETICS[slot[0]]:
			var b = Button.new()
			var wearing = Profile3D.data.cosmetics.get(slot[0], "") == it.id
			var avail = Profile3D.can_wear(slot[0], it)
			var tag = ""
			if not avail:
				if it.has("achievement"):
					tag = " (succès)"
				elif it.has("level") and Profile3D.level_info().level < int(it.level):
					tag = " (niv. %d)" % int(it.level)
				else:
					tag = " (%d cr)" % int(it.get("price", 0))
			b.text = ("> " if wearing else "") + String(it.name) + tag
			b.custom_minimum_size = Vector2(0, 42)
			var sl = slot[0]
			b.pressed.connect(func(): _wear(sl, it))
			row.add_child(b)
	content.add_child(UiTheme.button("Retour", show_main))


func _wear(slot: String, it: Dictionary) -> void:
	if not Profile3D.can_wear(slot, it):
		if not Profile3D.buy(slot, it):
			return
	Profile3D.data.cosmetics[slot] = it.id
	Profile3D.save()
	show_custom()


func show_settings() -> void:
	_clear()
	var s = Profile3D.data.settings
	content.add_child(UiTheme.title("Réglages", 30))
	for spec in [["sensitivity", "Sensibilité de la visée", 0.3, 3.0], ["volume", "Volume", 0.0, 1.0]]:
		content.add_child(UiTheme.label(spec[1], 16))
		var sl = HSlider.new()
		sl.min_value = spec[2]
		sl.max_value = spec[3]
		sl.step = 0.05
		sl.value = float(s[spec[0]])
		sl.custom_minimum_size = Vector2(480, 36)
		var key = spec[0]
		sl.value_changed.connect(_set_setting.bind(key))
		content.add_child(sl)
	for spec in [["mic", "Micro : ma vraie voix fait du bruit (les créatures l'entendent)"], ["tts", "Voix des bots (synthèse vocale)"],
			["shadows", "Ombres de la lampe torche (désactiver si le téléphone rame)"]]:
		var c = CheckButton.new()
		c.text = spec[1]
		c.button_pressed = bool(s[spec[0]])
		var key = spec[0]
		c.toggled.connect(_set_setting.bind(key))
		content.add_child(c)
	content.add_child(UiTheme.label("Résolution 3D (plus bas = plus fluide)", 16))
	content.add_child(_option([["1.0", "100 %"], ["0.85", "85 %"], ["0.7", "70 %"], ["0.55", "55 %"]], "%s" % str(s.scale),
		_set_scale))
	content.add_child(UiTheme.button("Retour", show_main))


func show_bestiary() -> void:
	_clear()
	content.add_child(UiTheme.title("Bestiaire", 30))
	for id in Data.db.MONSTERS:
		var m = Data.db.MONSTERS[id]
		content.add_child(UiTheme.label(String(m.name).to_upper() + " — " + m.title, 18, UiTheme.ACCENT))
		content.add_child(UiTheme.label(m.lore, 14))
		for c in m.clues:
			content.add_child(UiTheme.label("• " + c, 14, Color(0.75, 0.85, 0.8)))
	content.add_child(UiTheme.button("Retour", show_main))


func show_results(r: Dictionary, gain: Dictionary, online := false) -> void:
	_clear()
	content.add_child(UiTheme.title("MISSION RÉUSSIE" if r.get("success", false) else "MISSION ÉCHOUÉE", 32))
	var reasons = {"departure": "Départ du fourgon", "time": "Temps écoulé", "wipe": "Toute l'équipe est à terre", "abandon": "Mission abandonnée"}
	content.add_child(UiTheme.label("%s — %s — butin %d / %d cr (+%d bonus)" % [r.get("missionName", ""), reasons.get(r.get("reason", ""), r.get("reason", "")),
		int(r.get("deposited", 0)), int(r.get("quota", 0)), int(r.get("bonus", 0))], 16))
	content.add_child(UiTheme.label("Vous gagnez %d crédits et %d XP%s" % [int(gain.coins), int(gain.xp), (" — NIVEAU %d !" % int(gain.level)) if gain.level_up else ""], 18,
		Color(0.6, 1.0, 0.7)))
	if r.get("awards", []).size() > 0:
		content.add_child(UiTheme.label("Distinctions", 18, UiTheme.ACCENT))
		for a in r.awards:
			content.add_child(UiTheme.label("%s — %s%s" % [a.name, a.playerName, (" : " + a.desc) if a.id == "absurd" else (" (%s)" % a.value if a.value != "" else "")], 15))
	content.add_child(UiTheme.label("Équipe", 18, UiTheme.ACCENT))
	var states = {"extracted": "dans le fourgon", "dead": "mort", "downed": "à terre", "alive": "laissé sur place"}
	for p in r.get("players", []):
		var st = p.stats
		var cause = (" — " + st.deathCause) if st.deathCause != "" else ""
		content.add_child(UiTheme.label("%s : %s%s · chargé %d cr · bruit %d · réanimations %d" % [p.name, states.get(p.state, p.state), cause, int(st.deposited),
			int(st.noise), int(st.revives)], 14))
	if r.get("highlights", []).size() > 0:
		content.add_child(UiTheme.label("Moments forts", 18, UiTheme.ACCENT))
		for h in r.highlights.slice(maxi(0, r.highlights.size() - 6)):
			content.add_child(UiTheme.label("[%d:%02d] %s" % [int(h.t) / 60, int(h.t) % 60, h.text], 14))
	if online:
		content.add_child(UiTheme.button("Retour au salon", func(): net_send.emit({"t": "backToLobby"})))
		content.add_child(UiTheme.button("Quitter le salon", func(): leave_requested.emit()))
	else:
		content.add_child(UiTheme.button("Rejouer", show_solo))
		content.add_child(UiTheme.button("Menu principal", show_main))


# ------------------------------------------------------------------ EN LIGNE
func show_online(err := "") -> void:
	_clear()
	content.add_child(UiTheme.title("Multijoueur en ligne", 30))
	content.add_child(UiTheme.label("Adresse du serveur du jeu (celui que l'hôte a lancé : « npm start » sur un PC du même Wi-Fi, ou serveur en ligne). "
		+ "Exemple : 192.168.1.20:8080", 14, Color(0.75, 0.75, 0.75)))
	var srv = LineEdit.new()
	srv.text = String(Profile3D.data.get("server", ""))
	srv.placeholder_text = "192.168.1.20:8080"
	srv.custom_minimum_size = Vector2(480, 46)
	content.add_child(srv)
	content.add_child(UiTheme.button("Créer un salon", func(): _go_online("create", srv.text, "")))
	var code = LineEdit.new()
	code.placeholder_text = "CODE"
	code.max_length = 8
	code.custom_minimum_size = Vector2(480, 46)
	content.add_child(code)
	content.add_child(UiTheme.button("Rejoindre avec ce code", func(): _go_online("join", srv.text, code.text)))
	status_label = UiTheme.label(err, 15, Color(1.0, 0.5, 0.4))
	content.add_child(status_label)
	content.add_child(UiTheme.button("Retour", show_main))


func _go_online(action: String, server: String, code: String) -> void:
	if server.strip_edges() == "":
		status_label.text = "Indiquez l'adresse du serveur."
		return
	if action == "join" and code.strip_edges() == "":
		status_label.text = "Indiquez le code du salon."
		return
	Profile3D.data.server = server.strip_edges()
	Profile3D.save()
	status_label.text = "Connexion…"
	status_label.add_theme_color_override("font_color", Color(0.8, 0.85, 0.9))
	online_requested.emit(action, server.strip_edges(), code.strip_edges().to_upper())


func set_status(text: String) -> void:
	if status_label != null and is_instance_valid(status_label):
		status_label.text = text


func show_lobby(l: Dictionary, my_id: String) -> void:
	var keep_chat = lobby_chat_edit.text if lobby_chat_edit != null and is_instance_valid(lobby_chat_edit) else ""
	_clear()
	var me_host = false
	for m in l.members:
		if m.id == my_id and m.isHost:
			me_host = true
	content.add_child(UiTheme.title("Salon %s" % l.code, 34))
	content.add_child(UiTheme.label("Donnez ce code à vos amis (version 2D ou 3D).", 14, Color(0.75, 0.75, 0.75)))
	for m in l.members:
		var tags = []
		if m.isHost:
			tags.append("hôte")
		tags.append("prêt" if m.ready or m.isHost else "pas prêt")
		if not m.connected:
			tags.append("déconnecté")
		tags.append(m.get("platform", "pc"))
		content.add_child(UiTheme.label("%s%s — %s" % ["> " if m.id == my_id else "", m.name, ", ".join(tags)], 16))
	var st = l.settings
	var mi = Data.db.MISSIONS.get(st.mission, {})
	var di = Data.db.DIFFICULTIES.get(st.difficulty, {})
	content.add_child(UiTheme.label("Mission : %s — difficulté : %s — équipe de %d %s" % [mi.get("name", st.mission), di.get("name", st.difficulty), int(st.teamSize),
		"(complétée par des bots)" if st.fillBots else ""], 15, UiTheme.ACCENT))
	if me_host:
		var ms = []
		for id in Data.db.MISSIONS:
			ms.append([id, Data.db.MISSIONS[id].name])
		content.add_child(_option(ms, st.mission, func(v): net_send.emit({"t": "settings", "mission": v})))
		var ds = []
		for id in Data.db.DIFFICULTIES:
			ds.append([id, Data.db.DIFFICULTIES[id].name])
		content.add_child(_option(ds, st.difficulty, func(v): net_send.emit({"t": "settings", "difficulty": v})))
		content.add_child(_option([["1", "Équipe de 1"], ["2", "Équipe de 2"], ["3", "Équipe de 3"], ["4", "Équipe de 4"]], str(int(st.teamSize)),
			func(v): net_send.emit({"t": "settings", "teamSize": int(v)})))
		var fb = CheckButton.new()
		fb.text = "Compléter l'équipe avec des bots"
		fb.button_pressed = bool(st.fillBots)
		fb.toggled.connect(func(v): net_send.emit({"t": "settings", "fillBots": v}))
		content.add_child(fb)
		content.add_child(UiTheme.button("LANCER LA MISSION", func(): net_send.emit({"t": "start", "force": true})))
	else:
		var ready = false
		for m in l.members:
			if m.id == my_id:
				ready = m.ready
		content.add_child(UiTheme.button("Je ne suis plus prêt" if ready else "Je suis prêt", func(): net_send.emit({"t": "ready", "v": not ready})))
	content.add_child(UiTheme.label("Discussion", 16))
	for c in l.get("chat", []).slice(maxi(0, l.chat.size() - 8)):
		content.add_child(UiTheme.label(("%s : %s" % [c.name, c.text]) if c.name != "" else c.text, 14, Color(0.85, 0.85, 0.8)))
	lobby_chat_edit = LineEdit.new()
	lobby_chat_edit.placeholder_text = "Message…"
	lobby_chat_edit.text = keep_chat
	lobby_chat_edit.custom_minimum_size = Vector2(480, 44)
	lobby_chat_edit.text_submitted.connect(_send_chat)
	content.add_child(lobby_chat_edit)
	content.add_child(UiTheme.button("Quitter le salon", func(): leave_requested.emit()))


func _send_chat(text: String) -> void:
	if text.strip_edges() != "":
		net_send.emit({"t": "chat", "text": text.strip_edges()})
	lobby_chat_edit.text = ""
