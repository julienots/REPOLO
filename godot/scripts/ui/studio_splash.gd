# Intro « SuperEssence. STUDIO » (environ 2,4 s), jouée au lancement avant l'écran de
# chargement du jeu. Logo officiel du studio (images dans res://assets/studio), jamais
# redessiné ni recoloré. Minutage :
#   0,15 s  le mot apparaît avec un rebond (échelle 0,62 → 1, courbe à dépassement)
#   0,72 s  le point jaune tombe d'en haut et rebondit, un anneau jaune s'élargit et s'efface
#   1,05 s  un reflet blanc balaie le mot (masqué par la forme du logo)
#   1,10 s  « STUDIO » en petites capitales blanches à 72 % d'opacité
#   2,35 s  fondu au noir 0,35 s, puis signal « finished »
# Un toucher passe l'intro seulement après un premier visionnage complet. Avec « réduire les
# animations » : simple fondu, sans rebond ni reflet.
class_name StudioSplash
extends Control

signal finished

const YELLOW = Color("#FCCC24")
const WORD_TEX = "res://assets/studio/super-essence-mot.png"
const DOT_TEX = "res://assets/studio/super-essence-point.png"

var word: TextureRect
var dot: TextureRect
var ring: Control
var shine: ColorRect
var studio: Label
var fade: ColorRect
var ring_r = 0.0
var ring_a = 0.0
var done = false
var can_skip = false
var tween: Tween


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	var bg = ColorRect.new()
	bg.color = Color(0, 0, 0)
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(bg)
	var settings = Profile3D.data.get("settings", {})
	can_skip = bool(settings.get("intro_seen", false))
	var reduce = bool(settings.get("reduce_motion", false))
	var vp = get_viewport_rect().size
	var tex_w: Texture2D = load(WORD_TEX)
	var tex_d: Texture2D = load(DOT_TEX)
	# même cadrage pour le mot et le point : on garde les proportions, jamais d'étirement
	var w = minf(vp.x * 0.72, 860.0)
	var h = w * float(tex_w.get_height()) / float(tex_w.get_width())
	var holder = Control.new()
	holder.size = Vector2(w, h)
	holder.position = (vp - holder.size) / 2.0 - Vector2(0, h * 0.2)
	holder.pivot_offset = holder.size / 2.0
	add_child(holder)
	word = _tex(holder, tex_w, w, h)
	word.clip_children = CanvasItem.CLIP_CHILDREN_AND_DRAW
	shine = ColorRect.new()
	shine.color = Color(1, 1, 1, 0.55)
	shine.size = Vector2(h * 0.45, h * 3.0)
	shine.position = Vector2(-h, -h)
	shine.rotation = 0.35
	word.add_child(shine)
	dot = _tex(holder, tex_d, w, h)
	ring = Control.new()
	ring.size = Vector2(w, h)
	ring.mouse_filter = Control.MOUSE_FILTER_IGNORE
	ring.draw.connect(_draw_ring)
	holder.add_child(ring)
	studio = Label.new()
	studio.text = "S T U D I O"
	studio.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	studio.add_theme_font_size_override("font_size", int(clampf(h * 0.2, 16, 30)))
	studio.add_theme_color_override("font_color", Color(1, 1, 1, 0.72))
	studio.size = Vector2(w, h * 0.4)
	studio.position = holder.position + Vector2(0, h * 1.05)
	studio.modulate.a = 0.0
	add_child(studio)
	fade = ColorRect.new()
	fade.color = Color(0, 0, 0)
	fade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	fade.modulate.a = 0.0
	fade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(fade)
	# images déjà décodées (ressources importées) : on attend une image pour éviter un saut
	word.modulate.a = 0.0
	dot.modulate.a = 0.0
	await get_tree().process_frame
	if reduce:
		_play_reduced()
	else:
		_play(holder, h)


func _tex(parent: Control, tex: Texture2D, w: float, h: float) -> TextureRect:
	var r = TextureRect.new()
	r.texture = tex
	r.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	r.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	r.size = Vector2(w, h)
	r.pivot_offset = Vector2(w, h) / 2.0
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	parent.add_child(r)
	return r


func _play(holder: Control, h: float) -> void:
	tween = create_tween()
	tween.set_parallel(true)
	# 1. le mot rebondit
	word.scale = Vector2(0.62, 0.62)
	tween.tween_property(word, "modulate:a", 1.0, 0.2).set_delay(0.15)
	tween.tween_property(word, "scale", Vector2.ONE, 0.55).set_delay(0.15).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	# 2. le point tombe d'en haut et rebondit, l'anneau s'élargit
	dot.position.y = -get_viewport_rect().size.y * 0.5
	tween.tween_property(dot, "modulate:a", 1.0, 0.05).set_delay(0.72)
	tween.tween_property(dot, "position:y", 0.0, 0.42).set_delay(0.72).set_trans(Tween.TRANS_BOUNCE).set_ease(Tween.EASE_OUT)
	tween.tween_callback(func(): ring_a = 1.0).set_delay(0.95)
	tween.tween_method(_ring_step, 0.0, 1.0, 0.5).set_delay(0.95)
	# 3. reflet qui balaie le mot
	tween.tween_property(shine, "position:x", word.size.x + h, 0.5).set_delay(1.05).set_trans(Tween.TRANS_SINE)
	# 4. STUDIO
	tween.tween_property(studio, "modulate:a", 1.0, 0.35).set_delay(1.1)
	# 5. fondu au noir
	tween.tween_property(fade, "modulate:a", 1.0, 0.35).set_delay(2.35)
	tween.chain().tween_callback(_finish.bind(true))


func _play_reduced() -> void:
	tween = create_tween()
	tween.set_parallel(true)
	tween.tween_property(word, "modulate:a", 1.0, 0.4)
	tween.tween_property(dot, "modulate:a", 1.0, 0.4)
	tween.tween_property(studio, "modulate:a", 1.0, 0.4)
	tween.tween_property(fade, "modulate:a", 1.0, 0.35).set_delay(2.0)
	tween.chain().tween_callback(_finish.bind(true))


func _ring_step(u: float) -> void:
	ring_r = u
	ring_a = 1.0 - u
	ring.queue_redraw()


func _draw_ring() -> void:
	if ring_a <= 0.0:
		return
	# centre du point jaune : à droite du logo, sur la ligne de base
	var c = Vector2(ring.size.x * 0.972, ring.size.y * 0.62)
	ring.draw_arc(c, 8.0 + ring_r * ring.size.y * 0.9, 0, TAU, 48, Color(YELLOW, ring_a), 4.0 * (1.0 - ring_r) + 1.0, true)


func _gui_input(event: InputEvent) -> void:
	var tap = (event is InputEventScreenTouch and event.pressed) or (event is InputEventMouseButton and event.pressed)
	if tap and can_skip and not done:
		_finish(false)


func _finish(full: bool) -> void:
	if done:
		return
	done = true
	if tween:
		tween.kill()
	if full and not bool(Profile3D.data.settings.get("intro_seen", false)):
		Profile3D.data.settings["intro_seen"] = true
		Profile3D.save()
	finished.emit()
