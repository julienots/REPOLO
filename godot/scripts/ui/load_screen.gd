# Écran de chargement propre au jeu (après l'intro du studio) : palette Récup'Express,
# emblème du Récupérateur, vraie barre de progression (set_progress 0..100, pilotée par
# main.gd pendant la construction du décor), une phrase du lore qui change pendant
# l'attente, puis « Toucher pour jouer ».
class_name LoadScreen
extends Control

signal play_pressed

const ORANGE = Color("#E8742A")
const ENCRE = Color("#1B1F24")
const LAMPE = Color("#FFE6A8")
const MOISI = Color("#6E8B3D")
const ROUILLE = Color("#B23A2E")

const LORE = [
	"Récup'Express rachète tout ce qui traîne dans les lieux que personne ne réclame.",
	"Les lunettes sont réglementaires. L'entreprise en a commandé trois mille de trop.",
	"Les créatures ne chassent pas : elles gardent les lieux. Vous, vous dérangez.",
	"Le fourgon n'attend jamais longtemps. Le chauffeur non plus.",
	"Règle n° 4 du manuel : ne jamais crier. Règle n° 5 : relire la règle n° 4.",
	"Un objet cassé ne vaut plus rien. Un collègue cassé non plus, mais on le relève.",
]

var bar_fill: ColorRect
var bar_back: Panel
var pct: Label
var lore: Label
var play_btn: Button
var emblem: Control
var progress = 0.0
var shown = 0.0
var lore_i = 0
var lore_t = 0.0
var t = 0.0
var ready_to_play = false


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	var bg = ColorRect.new()
	bg.color = ENCRE
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(bg)
	var font = UiTheme.title_font()
	# marges sûres (encoche, barre de gestes)
	var safe = DisplayServer.get_display_safe_area()
	var win = DisplayServer.window_get_size()
	var vp = get_viewport_rect().size
	var k = vp.x / maxf(1.0, float(win.x))
	var m_l = maxf(24.0, safe.position.x * k)
	var m_r = maxf(24.0, (win.x - safe.end.x) * k)
	var box = VBoxContainer.new()
	box.alignment = BoxContainer.ALIGNMENT_CENTER
	box.add_theme_constant_override("separation", 14)
	box.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	box.offset_left = m_l
	box.offset_right = -m_r
	box.offset_top = 16
	box.offset_bottom = -16
	add_child(box)
	emblem = Control.new()
	emblem.custom_minimum_size = Vector2(0, clampf(vp.y * 0.26, 90, 200))
	emblem.draw.connect(_draw_emblem)
	box.add_child(emblem)
	var t1 = _title("OPÉRATION", ORANGE, int(clampf(vp.y * 0.075, 30, 64)), font)
	var t2 = _title("PANIQUE", LAMPE, int(clampf(vp.y * 0.095, 38, 84)), font)
	t2.add_theme_color_override("font_shadow_color", ROUILLE)
	var titles = VBoxContainer.new()
	titles.add_theme_constant_override("separation", -int(t2.get_theme_font_size("font_size") * 0.45))
	titles.add_child(t1)
	titles.add_child(t2)
	box.add_child(titles)
	var bar_holder = CenterContainer.new()
	box.add_child(bar_holder)
	bar_back = Panel.new()
	var sb = StyleBoxFlat.new()
	sb.bg_color = Color(0.2, 0.22, 0.25)
	sb.set_corner_radius_all(10)
	sb.border_color = Color(0.07, 0.08, 0.09)
	sb.set_border_width_all(3)
	bar_back.add_theme_stylebox_override("panel", sb)
	bar_back.custom_minimum_size = Vector2(minf(vp.x * 0.6, 560.0), 22)
	bar_back.clip_contents = true
	bar_holder.add_child(bar_back)
	bar_fill = ColorRect.new()
	bar_fill.color = ORANGE
	bar_fill.position = Vector2(3, 3)
	bar_fill.size = Vector2(0, 16)
	bar_back.add_child(bar_fill)
	pct = _title("0 %", Color(0.75, 0.72, 0.66), 18, font)
	pct.add_theme_constant_override("shadow_offset_y", 0)
	box.add_child(pct)
	lore = Label.new()
	lore.text = LORE[0]
	lore.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	lore.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	lore.add_theme_font_size_override("font_size", int(clampf(vp.y * 0.032, 16, 22)))
	lore.add_theme_color_override("font_color", Color(0.85, 0.82, 0.76))
	lore.custom_minimum_size = Vector2(0, 60)
	box.add_child(lore)
	var btn_holder = CenterContainer.new()
	btn_holder.custom_minimum_size = Vector2(0, 72)
	box.add_child(btn_holder)
	play_btn = Button.new()
	play_btn.text = "Toucher pour jouer"
	play_btn.custom_minimum_size = Vector2(minf(vp.x * 0.6, 420.0), 64)
	play_btn.add_theme_font_override("font", font)
	play_btn.add_theme_font_size_override("font_size", 26)
	UiTheme.style_primary(play_btn)
	play_btn.modulate.a = 0.0
	play_btn.disabled = true
	play_btn.pressed.connect(_on_play)
	btn_holder.add_child(play_btn)
	lore_i = randi() % LORE.size()
	lore.text = LORE[lore_i]


func _title(text: String, col: Color, size: int, font: Font) -> Label:
	var l = Label.new()
	l.text = text
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.add_theme_font_override("font", font)
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", col)
	l.add_theme_color_override("font_shadow_color", Color(0.48, 0.21, 0.06))
	l.add_theme_constant_override("shadow_offset_x", 0)
	l.add_theme_constant_override("shadow_offset_y", 4)
	l.add_theme_constant_override("line_spacing", -12)
	return l


func set_progress(v: float) -> void:
	progress = clampf(v, 0.0, 100.0)


func _process(delta: float) -> void:
	t += delta
	shown = move_toward(shown, progress, delta * 160.0)
	bar_fill.size.x = (bar_back.size.x - 6.0) * shown / 100.0
	if not ready_to_play:
		pct.text = "%d %%" % int(round(shown))
	lore_t += delta
	if lore_t > 3.2:
		lore_t = 0.0
		lore_i = (lore_i + 1) % LORE.size()
		var tw = create_tween()
		tw.tween_property(lore, "modulate:a", 0.0, 0.2)
		tw.tween_callback(func(): lore.text = LORE[lore_i])
		tw.tween_property(lore, "modulate:a", 1.0, 0.25)
	if not ready_to_play and shown >= 99.9:
		ready_to_play = true
		play_btn.disabled = false
		pct.text = "Prêt"
		var tw = create_tween()
		tw.tween_property(play_btn, "modulate:a", 1.0, 0.25)
		play_btn.grab_focus()
	if ready_to_play:
		play_btn.scale = Vector2.ONE * (1.0 + sin(t * 3.0) * 0.02)
		play_btn.pivot_offset = play_btn.size / 2.0
	emblem.queue_redraw()


func _gui_input(event: InputEvent) -> void:
	if ready_to_play and ((event is InputEventScreenTouch and event.pressed) or (event is InputEventMouseButton and event.pressed)):
		_on_play()


func _unhandled_input(event: InputEvent) -> void:
	if ready_to_play and event is InputEventKey and event.pressed:
		_on_play()


func _on_play() -> void:
	if not ready_to_play:
		return
	ready_to_play = false
	var tw = create_tween()
	tw.tween_property(self, "modulate:a", 0.0, 0.3)
	tw.tween_callback(func(): play_pressed.emit())


# Emblème : un Récupérateur dessiné en formes rondes (corps-galet, lunettes doubles,
# lampe frontale, hotte), qui se dandine doucement.
func _draw_emblem() -> void:
	var s = emblem.size
	var h = s.y
	var c = Vector2(s.x / 2.0, h * 0.52)
	var wob = sin(t * 3.0) * 0.06
	emblem.draw_set_transform(c, wob, Vector2.ONE)
	var bw = h * 0.5
	var bh = h * 0.78
	var ink = Color(0.07, 0.08, 0.09)
	# ombre au sol
	emblem.draw_set_transform(c + Vector2(0, bh * 0.52), 0, Vector2(1, 0.18))
	emblem.draw_circle(Vector2.ZERO, bw * 0.62, Color(0, 0, 0, 0.45))
	emblem.draw_set_transform(c, wob, Vector2.ONE)
	# hotte
	_rrect(Rect2(-bw * 0.72, -bh * 0.2, bw * 0.4, bh * 0.55), ORANGE.darkened(0.45), ink, h * 0.06)
	# jambes
	for x in [-0.22, 0.22]:
		_rrect(Rect2(bw * x - bw * 0.14, bh * 0.3, bw * 0.28, bh * 0.22), ORANGE.darkened(0.45), ink, h * 0.05)
	# corps-galet
	_rrect(Rect2(-bw / 2.0, -bh / 2.0, bw, bh * 0.88), ORANGE, ink, bw * 0.5)
	# bande réfléchissante
	emblem.draw_rect(Rect2(-bw / 2.0 + 3, bh * 0.14, bw - 6, h * 0.04), Color(0.92, 0.9, 0.85))
	# lunettes doubles
	var gy = -bh * 0.18
	emblem.draw_rect(Rect2(-bw / 2.0, gy - h * 0.025, bw, h * 0.05), ink)
	for x in [-0.2, 0.2]:
		emblem.draw_circle(Vector2(bw * x, gy), h * 0.1, ink)
		emblem.draw_circle(Vector2(bw * x, gy), h * 0.068, LAMPE)
		emblem.draw_circle(Vector2(bw * x - h * 0.02, gy - h * 0.02), h * 0.018, Color(1, 1, 1))
	# lampe frontale
	_rrect(Rect2(-h * 0.05, -bh * 0.43, h * 0.1, h * 0.07), Color(0.18, 0.2, 0.23), ink, h * 0.02)
	emblem.draw_circle(Vector2(0, -bh * 0.43 + h * 0.035), h * 0.02, LAMPE)
	emblem.draw_set_transform(Vector2.ZERO, 0, Vector2.ONE)


func _rrect(r: Rect2, fill: Color, border: Color, radius: float) -> void:
	var sb = StyleBoxFlat.new()
	sb.bg_color = fill
	sb.border_color = border
	sb.set_border_width_all(int(maxf(2.0, emblem.size.y * 0.02)))
	sb.set_corner_radius_all(int(radius))
	sb.anti_aliasing = true
	emblem.draw_style_box(sb, r)
