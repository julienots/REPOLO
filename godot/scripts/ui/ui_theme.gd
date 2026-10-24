# Thème visuel des menus (boutons sombres, liseré orange « Récup'Express »).
class_name UiTheme
extends RefCounted

const ACCENT = Color(0.91, 0.64, 0.24)
const BG = Color(0.06, 0.065, 0.07, 0.92)


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
	t.set_stylebox("normal", "Button", _box(Color(0.12, 0.12, 0.13, 0.95), Color(0.3, 0.3, 0.32)))
	t.set_stylebox("hover", "Button", _box(Color(0.18, 0.15, 0.12, 0.95), ACCENT))
	t.set_stylebox("pressed", "Button", _box(Color(0.3, 0.2, 0.1, 0.95), ACCENT))
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
