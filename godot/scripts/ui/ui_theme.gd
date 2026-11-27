# Thème visuel des menus (boutons sombres, liseré orange « Récup'Express »).
class_name UiTheme
extends RefCounted

const ACCENT = Color(0.91, 0.64, 0.24)
const BG = Color(0.06, 0.065, 0.07, 0.92)
const ORANGE = Color("#E8742A")
const ORANGE_DARK = Color("#7A3510")

static var _title_font: FontVariation


# Police des titres et des boutons : Baloo 2 (arrondie, épaisse ; licence OFL dans assets/fonts).
static func title_font() -> Font:
	if _title_font == null:
		_title_font = FontVariation.new()
		_title_font.base_font = load("res://assets/fonts/Baloo2.ttf")
		_title_font.variation_opentype = {TextServerManager.get_primary_interface().name_to_tag("wght"): 800}
	return _title_font


# Bouton « en relief » : bord inférieur épais plus sombre, qui s'enfonce quand on appuie.
static func _relief(col: Color, edge: Color, pressed := false) -> StyleBoxFlat:
	var s = _box(col, edge, 3, 14)
	s.border_width_bottom = 3 if pressed else 8
	s.content_margin_top = 13 if pressed else 8
	s.anti_aliasing = true
	return s


static func style_primary(b: Button) -> void:
	b.add_theme_stylebox_override("normal", _relief(ORANGE, ORANGE_DARK))
	b.add_theme_stylebox_override("hover", _relief(ORANGE.lightened(0.08), ORANGE_DARK))
	b.add_theme_stylebox_override("pressed", _relief(ORANGE.darkened(0.08), ORANGE_DARK, true))
	b.add_theme_stylebox_override("focus", _box(Color(0, 0, 0, 0), Color("#FFE6A8"), 3, 14))
	b.add_theme_color_override("font_color", Color("#1B1F24"))
	b.add_theme_color_override("font_hover_color", Color("#1B1F24"))
	b.add_theme_color_override("font_pressed_color", Color("#1B1F24"))
	b.add_theme_color_override("font_focus_color", Color("#1B1F24"))


static func _box(col: Color, border: Color, bw := 2, radius := 6) -> StyleBoxFlat:
	var s = StyleBoxFlat.new()
	s.bg_color = col
	s.border_color = border
	s.set_border_width_all(bw)
	s.set_corner_radius_all(radius)
	s.content_margin_left = 14
	s.content_margin_right = 14
	s.content_margin_top = 8
	s.content_margin_bottom = 8
	return s


static func make(mobile: bool) -> Theme:
	var t = Theme.new()
	t.default_font_size = 22 if mobile else 18
	t.set_stylebox("normal", "Button", _relief(Color(0.17, 0.19, 0.22, 0.97), Color(0.06, 0.07, 0.08)))
	t.set_stylebox("hover", "Button", _relief(Color(0.22, 0.2, 0.18, 0.97), ACCENT))
	t.set_stylebox("pressed", "Button", _relief(Color(0.3, 0.2, 0.1, 0.97), ACCENT, true))
	t.set_font("font", "Button", title_font())
	t.set_stylebox("focus", "Button", _box(Color(0, 0, 0, 0), ACCENT, 2))
	t.set_stylebox("disabled", "Button", _box(Color(0.08, 0.08, 0.08, 0.8), Color(0.2, 0.2, 0.2)))
	t.set_color("font_color", "Button", Color(0.93, 0.9, 0.85))
	t.set_color("font_hover_color", "Button", Color(1, 0.9, 0.75))
	t.set_color("font_disabled_color", "Button", Color(0.45, 0.45, 0.45))
	t.set_stylebox("panel", "PanelContainer", _box(BG, Color(0.25, 0.22, 0.2), 1, 10))
	t.set_stylebox("normal", "LineEdit", _box(Color(0.1, 0.1, 0.11), Color(0.35, 0.35, 0.35)))
	t.set_stylebox("normal", "OptionButton", _box(Color(0.12, 0.12, 0.13, 0.95), Color(0.3, 0.3, 0.32)))
	t.set_stylebox("hover", "OptionButton", _box(Color(0.18, 0.15, 0.12, 0.95), ACCENT))
	t.set_stylebox("pressed", "OptionButton", _box(Color(0.3, 0.2, 0.1, 0.95), ACCENT))
	t.set_color("font_color", "Label", Color(0.92, 0.9, 0.85))
	return t


static func title(text: String, size: int) -> Label:
	var l = Label.new()
	l.text = text
	l.add_theme_font_override("font", title_font())
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", ACCENT)
	l.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 1))
	l.add_theme_constant_override("shadow_offset_x", 3)
	l.add_theme_constant_override("shadow_offset_y", 3)
	return l


static func label(text: String, size := 0, col := Color(0.92, 0.9, 0.85)) -> Label:
	var l = Label.new()
	l.text = text
	if size > 0:
		l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", col)
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	return l


static func button(text: String, cb: Callable, min_w := 300.0) -> Button:
	var b = Button.new()
	b.text = text
	b.custom_minimum_size = Vector2(min_w, 52)
	b.pressed.connect(cb)
	return b
