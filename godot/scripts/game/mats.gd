# Matériaux du jeu 3D : textures de bruit générées une fois au lancement (aucun fichier
# image à télécharger), shaders de surface triplanaires et de peau, matériaux standard.
class_name Mats
extends RefCounted

const SURFACE = preload("res://shaders/surface.gdshader")
const SKIN = preload("res://shaders/skin.gdshader")

static var _noise: Texture2D
static var _cache = {}


# Texture de bruit en niveaux de gris, raccordable (sans couture), avec mipmaps.
static func noise() -> Texture2D:
	if _noise == null:
		var n = FastNoiseLite.new()
		n.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
		n.seed = 1337
		n.frequency = 0.012
		n.fractal_type = FastNoiseLite.FRACTAL_FBM
		n.fractal_octaves = 5
		var img = n.get_seamless_image(256, 256)
		img.convert(Image.FORMAT_L8)
		img.generate_mipmaps()
		_noise = ImageTexture.create_from_image(img)
	return _noise


static func color(hex: String) -> Color:
	return Color.html(hex) if hex.begins_with("#") else Color.html("#" + hex)


# Surface du décor. params : color_a, color_b, pattern, tile_size, roughness, metal, bump, scale...
static func surface(key: String, params: Dictionary) -> ShaderMaterial:
	if _cache.has(key):
		return _cache[key]
	var m = ShaderMaterial.new()
	m.shader = SURFACE
	m.set_shader_parameter("noise_tex", noise())
	for k in params:
		m.set_shader_parameter(k, params[k])
	_cache[key] = m
	return m


static func skin(key: String, params: Dictionary) -> ShaderMaterial:
	if _cache.has(key):
		return _cache[key]
	var m = ShaderMaterial.new()
	m.shader = SKIN
	m.set_shader_parameter("noise_tex", noise())
	for k in params:
		m.set_shader_parameter(k, params[k])
	_cache[key] = m
	return m


static func std(key: String, col: Color, rough := 0.7, metal := 0.0, emissive := 0.0) -> StandardMaterial3D:
	if _cache.has(key):
		return _cache[key]
	var m = StandardMaterial3D.new()
	m.albedo_color = col
	m.roughness = rough
	m.metallic = metal
	if emissive > 0:
		m.emission_enabled = true
		m.emission = col
		m.emission_energy_multiplier = emissive
	_cache[key] = m
	return m


# Matériau émissif « non éclairé » (yeux, voyants, écrans).
static func glow(key: String, col: Color, energy := 3.0) -> StandardMaterial3D:
	if _cache.has(key):
		return _cache[key]
	var m = StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.albedo_color = col * energy
	_cache[key] = m
	return m


static func clear_cache() -> void:
	_cache.clear()


# Jeu de matériaux d'un thème (entrepôt, hôtel, laboratoire) d'après sa palette.
static func theme_set(theme_id: String, pal: Dictionary) -> Dictionary:
	var floor_a = color(pal.floor).lightened(0.12)
	var floor_b = color(pal.floor2).darkened(0.25)
	var wall_a = color(pal.wall).lightened(0.1)
	var wall_b = color(pal.wall).darkened(0.3)
	var grime = Color(0.05, 0.045, 0.035)
	var floor_pattern = 0
	var floor_tile = 1.0
	var wall_pattern = 0
	var wet = 0.5
	match theme_id:
		"hotel":
			floor_pattern = 2
			floor_tile = 1.0
			wall_pattern = 4
			wet = 0.15
		"lab":
			floor_pattern = 1
			floor_tile = 0.6
			wall_pattern = 1
			wet = 0.35
	return {
		"floor": surface(theme_id + "_floor", {"color_a": floor_a, "color_b": floor_b, "grime_color": grime, "pattern": floor_pattern, "tile_size": floor_tile,
			"scale": 0.3, "roughness_min": 0.45, "roughness_max": 0.92, "bump": 0.5, "stains": 0.6, "wet": wet}),
		"wall": surface(theme_id + "_wall", {"color_a": wall_a, "color_b": wall_b, "grime_color": grime, "pattern": wall_pattern, "tile_size": 0.5 if theme_id == "lab" else 1.0,
			"scale": 0.28, "roughness_min": 0.7, "roughness_max": 0.98, "bump": 0.7, "stains": 0.8, "grime_height": 0.9}),
		"cracked": surface(theme_id + "_cracked", {"color_a": wall_a.darkened(0.15), "color_b": wall_b.darkened(0.35), "grime_color": grime, "pattern": 0,
			"scale": 0.5, "roughness_min": 0.8, "roughness_max": 1.0, "bump": 2.2, "stains": 1.0, "grime_height": 1.6}),
		"ceiling": surface(theme_id + "_ceiling", {"color_a": wall_b, "color_b": wall_b.darkened(0.5), "grime_color": grime, "pattern": 1 if theme_id != "warehouse" else 0,
			"tile_size": 1.2, "scale": 0.25, "roughness_min": 0.85, "roughness_max": 1.0, "bump": 0.4, "stains": 1.0}),
		"shelf": surface(theme_id + "_shelf", {"color_a": color(pal.shelf).lightened(0.15), "color_b": color(pal.shelf).darkened(0.4), "grime_color": grime, "pattern": 3,
			"scale": 0.8, "roughness_min": 0.35, "roughness_max": 0.8, "metal": 0.55 if theme_id != "hotel" else 0.0, "bump": 0.3, "stains": 0.7, "grime_height": 0.3}),
		"table": surface(theme_id + "_table", {"color_a": color(pal.table).lightened(0.15), "color_b": color(pal.table).darkened(0.4), "grime_color": grime,
			"pattern": 2 if theme_id == "hotel" else 3, "tile_size": 1.5, "scale": 0.9, "roughness_min": 0.4, "roughness_max": 0.85,
			"metal": 0.4 if theme_id == "lab" else 0.0, "bump": 0.3, "stains": 0.4, "grime_height": 0.0}),
		"debris": surface(theme_id + "_debris", {"color_a": color(pal.debris), "color_b": color(pal.debris).darkened(0.5), "grime_color": grime, "pattern": 0,
			"scale": 1.6, "roughness_min": 0.1, "roughness_max": 0.6, "bump": 1.4, "stains": 0.2, "grime_height": 0.0}),
		"grate": surface(theme_id + "_grate", {"color_a": color(pal.grate).lightened(0.2), "color_b": color(pal.grate).darkened(0.5), "grime_color": Color(0.01, 0.01, 0.01),
			"pattern": 5, "tile_size": 0.16, "scale": 0.9, "roughness_min": 0.3, "roughness_max": 0.7, "metal": 0.7, "bump": 0.4, "stains": 0.6}),
		"door": surface(theme_id + "_door", {"color_a": wall_a.lerp(Color(0.35, 0.25, 0.18), 0.6), "color_b": wall_b.lerp(Color(0.15, 0.1, 0.07), 0.6),
			"grime_color": grime, "pattern": 2 if theme_id == "hotel" else 3, "tile_size": 2.0, "scale": 0.7, "roughness_min": 0.5, "roughness_max": 0.9, "bump": 0.4,
			"stains": 0.6, "grime_height": 0.5}),
		"metal": surface(theme_id + "_metal", {"color_a": Color(0.42, 0.44, 0.45), "color_b": Color(0.18, 0.19, 0.2), "grime_color": grime, "pattern": 3,
			"scale": 0.9, "roughness_min": 0.3, "roughness_max": 0.75, "metal": 0.8, "bump": 0.25, "stains": 0.8, "grime_height": 0.4}),
		"accent": std(theme_id + "_accent", color(pal.accent), 0.5, 0.0, 0.6),
	}
