# Objets de butin en 3D (vase, télé cathodique, coffre-fort, flamant rose, piano...).
# Modèles procéduraux à l'échelle du rayon de collision de la simulation.
class_name ItemView
extends Node3D

const T = WorldBuilder.T

var iid = ""
var kind = ""
var shape = ""
var spin = 0.0
var glow_light: OmniLight3D


func setup(id: String, item_type: String) -> void:
	iid = id
	kind = item_type
	var def = Data.db.ITEMS[item_type]
	shape = String(def.get("shape", "crate"))
	var col = Color.html(def.get("color", "#888888"))
	var r = float(def.radius) * T
	var mat = Mats.std("item_" + item_type, col, 0.45, 0.1)
	var dark = Mats.std("item_dark", Color(0.06, 0.06, 0.07), 0.6)
	var metal = Mats.std("item_metal", Color(0.6, 0.6, 0.62), 0.3, 0.9)
	var wood = Mats.surface("item_wood", {"color_a": Color(0.45, 0.3, 0.18), "color_b": Color(0.22, 0.13, 0.07), "pattern": 2, "tile_size": 0.6, "scale": 1.5,
		"roughness_min": 0.4, "roughness_max": 0.8, "bump": 0.3, "stains": 0.3, "grime_height": 0.0})
	match shape:
		"vase":
			Parts.mesh(self, Parts.cyl(r * 0.45, r * 0.55, r * 0.5, 16), mat, Vector3(0, r * 0.25, 0))
			Parts.mesh(self, Parts.sphere(r * 0.7), mat, Vector3(0, r * 0.75, 0), Vector3.ZERO, Vector3(1, 0.9, 1))
			Parts.mesh(self, Parts.cyl(r * 0.35, r * 0.25, r * 0.6, 16), mat, Vector3(0, r * 1.45, 0))
			Parts.mesh(self, Parts.torus(r * 0.3, r * 0.42, 16), Mats.std("gold", Color(0.85, 0.65, 0.2), 0.3, 1.0), Vector3(0, r * 1.75, 0))
		"lamp":
			Parts.mesh(self, Parts.cyl(r * 0.5, r * 0.6, r * 0.15, 12), metal, Vector3(0, r * 0.08, 0))
			Parts.mesh(self, Parts.cyl(r * 0.06, r * 0.06, r * 1.4, 8), metal, Vector3(0, r * 0.8, 0))
			Parts.mesh(self, Parts.cyl(r * 0.45, r * 0.8, r * 0.8, 12), mat, Vector3(0, r * 1.65, 0))
		"radio":
			Parts.mesh(self, Parts.box(Vector3(r * 1.6, r * 1.0, r * 0.7)), wood, Vector3(0, r * 0.5, 0))
			Parts.mesh(self, Parts.cyl(r * 0.3, r * 0.3, 0.02, 16), dark, Vector3(r * 0.36, r * 0.55, r * 0.35), Vector3(PI / 2, 0, 0))
			Parts.mesh(self, Parts.box(Vector3(r * 0.5, r * 0.25, 0.02)), Mats.glow("radio_dial", Color(1.0, 0.7, 0.3), 1.2), Vector3(-r * 0.4, r * 0.6, r * 0.35))
		"painting":
			Parts.mesh(self, Parts.box(Vector3(r * 1.7, r * 1.3, 0.05)), Mats.std("gold_frame", Color(0.6, 0.45, 0.15), 0.4, 0.8), Vector3(0, r * 0.66, 0), Vector3(-0.25, 0, 0))
			Parts.mesh(self, Parts.box(Vector3(r * 1.45, r * 1.05, 0.06)), mat, Vector3(0, r * 0.67, 0.01), Vector3(-0.25, 0, 0))
		"tv":
			Parts.mesh(self, Parts.box(Vector3(r * 1.5, r * 1.2, r * 1.3)), Mats.std("tv_case", Color(0.2, 0.2, 0.22), 0.6), Vector3(0, r * 0.6, 0))
			Parts.mesh(self, Parts.box(Vector3(0.02, r * 0.85, r * 1.0)), Mats.glow("tv_screen", Color(0.35, 0.45, 0.5), 0.6), Vector3(r * 0.76, r * 0.65, 0))
			Parts.mesh(self, Parts.cyl(0.005, 0.005, r * 1.2, 4), metal, Vector3(-r * 0.2, r * 1.6, r * 0.2), Vector3(0.5, 0, 0.3))
		"safe":
			Parts.mesh(self, Parts.box(Vector3(r * 1.35, r * 1.4, r * 1.35)), Mats.surface("safe_metal", {"color_a": col, "color_b": col.darkened(0.5), "pattern": 3,
				"scale": 1.2, "roughness_min": 0.3, "roughness_max": 0.6, "metal": 0.8, "bump": 0.2, "stains": 0.6, "grime_height": 0.3}), Vector3(0, r * 0.7, 0))
			Parts.mesh(self, Parts.cyl(r * 0.25, r * 0.25, 0.04, 16), metal, Vector3(r * 0.69, r * 0.75, 0), Vector3(0, 0, PI / 2))
		"flamingo":
			Parts.mesh(self, Parts.sphere(r * 0.55), mat, Vector3(0, r * 1.5, 0), Vector3.ZERO, Vector3(1.4, 0.9, 0.8))
			Parts.mesh(self, Parts.cyl(r * 0.05, r * 0.05, r * 1.3, 6), mat, Vector3(0, r * 0.65, 0))
			Parts.mesh(self, Parts.cyl(r * 0.07, r * 0.09, r * 0.9, 8), mat, Vector3(r * 0.45, r * 2.1, 0), Vector3(0, 0, -0.3))
			Parts.mesh(self, Parts.sphere(r * 0.18), mat, Vector3(r * 0.6, r * 2.55, 0))
			Parts.mesh(self, Parts.cyl(0.0, r * 0.07, r * 0.25, 6), dark, Vector3(r * 0.8, r * 2.5, 0), Vector3(0, 0, -2.0))
		"clock":
			Parts.mesh(self, Parts.box(Vector3(r * 0.9, r * 2.2, r * 0.6)), wood, Vector3(0, r * 1.1, 0))
			Parts.mesh(self, Parts.cyl(r * 0.35, r * 0.35, 0.02, 20), Mats.std("clock_face", Color(0.9, 0.86, 0.75), 0.6), Vector3(r * 0.46, r * 1.7, 0), Vector3(0, 0, PI / 2))
		"crate", "parcel":
			Parts.mesh(self, Parts.box(Vector3(r * 1.4, r * 1.2, r * 1.4)), wood if shape == "crate" else mat, Vector3(0, r * 0.6, 0))
			if shape == "parcel":
				Parts.mesh(self, Parts.box(Vector3(r * 1.42, r * 0.2, r * 0.3)), Mats.std("tape", Color(0.62, 0.52, 0.32), 0.25), Vector3(0, r * 1.15, 0))
				Parts.mesh(self, Parts.box(Vector3(r * 0.5, r * 0.3, 0.01)), Mats.glow("urgent", Color(1.0, 0.15, 0.1), 1.5), Vector3(0, r * 0.7, r * 0.71))
		"toolbox":
			Parts.mesh(self, Parts.box(Vector3(r * 1.7, r * 0.8, r * 0.8)), mat, Vector3(0, r * 0.4, 0))
			Parts.mesh(self, Parts.torus(r * 0.25, r * 0.32, 12), metal, Vector3(0, r * 0.9, 0), Vector3(PI / 2, 0, 0), Vector3(1.4, 1, 1))
		"gnome":
			Parts.mesh(self, Parts.cyl(r * 0.45, r * 0.6, r * 0.9, 12), Mats.std("gnome_body", Color(0.25, 0.45, 0.8) if kind == "gnome" else col, 0.5,
				0.9 if kind == "golden_gnome" else 0.0), Vector3(0, r * 0.45, 0))
			Parts.mesh(self, Parts.sphere(r * 0.38), Mats.std("gnome_face", Color(0.95, 0.75, 0.6) if kind == "gnome" else col, 0.5,
				0.9 if kind == "golden_gnome" else 0.0), Vector3(0, r * 1.1, 0))
			Parts.mesh(self, Parts.cyl(0.0, r * 0.4, r * 1.0, 12), mat, Vector3(0, r * 1.7, 0))
			Parts.mesh(self, Parts.cyl(r * 0.2, r * 0.32, r * 0.5, 10), Mats.std("beard", Color(0.95, 0.95, 0.93), 0.9), Vector3(r * 0.25, r * 0.85, 0))
		"bottle":
			Parts.mesh(self, Parts.cyl(r * 0.5, r * 0.5, r * 1.6, 12), Mats.std("glass_" + kind, col, 0.05, 0.2), Vector3(0, r * 0.8, 0))
			Parts.mesh(self, Parts.cyl(r * 0.18, r * 0.3, r * 0.9, 10), Mats.std("glass_" + kind, col, 0.05, 0.2), Vector3(0, r * 2.05, 0))
		"trophy":
			Parts.mesh(self, Parts.box(Vector3(r * 0.8, r * 0.3, r * 0.8)), dark, Vector3(0, r * 0.15, 0))
			Parts.mesh(self, Parts.cyl(r * 0.1, r * 0.15, r * 0.6, 8), Mats.std("gold", Color(0.85, 0.65, 0.2), 0.3, 1.0), Vector3(0, r * 0.6, 0))
			Parts.mesh(self, Parts.cyl(r * 0.6, r * 0.2, r * 0.8, 16), Mats.std("gold", Color(0.85, 0.65, 0.2), 0.3, 1.0), Vector3(0, r * 1.3, 0))
		"servers":
			Parts.mesh(self, Parts.box(Vector3(r * 1.2, r * 2.6, r * 1.2)), Mats.std("rack", Color(0.12, 0.13, 0.15), 0.5, 0.6), Vector3(0, r * 1.3, 0))
			for k in 8:
				Parts.mesh(self, Parts.box(Vector3(0.01, 0.015, 0.03)), Mats.glow("led_g" if k % 3 else "led_r", Color(0.2, 1.0, 0.3) if k % 3 else Color(1, 0.2, 0.1), 3.0),
					Vector3(r * 0.61, r * (0.4 + k * 0.27), r * 0.3))
		"jar":
			Parts.mesh(self, Parts.cyl(r * 0.7, r * 0.7, r * 1.6, 14), Mats.std("jar_glass", col, 0.05, 0.1), Vector3(0, r * 0.8, 0))
			Parts.mesh(self, Parts.sphere(r * 0.45), Mats.skin("jar_thing", {"base_color": Color(0.7, 0.6, 0.45), "dark_color": Color(0.3, 0.2, 0.1)}), Vector3(0, r * 0.75, 0))
			Parts.mesh(self, Parts.cyl(r * 0.72, r * 0.72, r * 0.2, 14), metal, Vector3(0, r * 1.7, 0))
		"microscope":
			Parts.mesh(self, Parts.box(Vector3(r * 1.0, r * 0.2, r * 0.8)), dark, Vector3(0, r * 0.1, 0))
			Parts.mesh(self, Parts.box(Vector3(r * 0.2, r * 1.4, r * 0.25)), mat, Vector3(-r * 0.3, r * 0.8, 0))
			Parts.mesh(self, Parts.cyl(r * 0.15, r * 0.12, r * 0.9, 10), mat, Vector3(0, r * 1.2, 0), Vector3(0, 0, -0.5))
		"piano":
			Parts.mesh(self, Parts.box(Vector3(r * 1.0, r * 2.2, r * 2.1)), Mats.std("piano", col, 0.15, 0.1), Vector3(0, r * 1.1, 0))
			Parts.mesh(self, Parts.box(Vector3(r * 0.6, r * 0.12, r * 1.9)), Mats.std("keys", Color(0.92, 0.9, 0.85), 0.3), Vector3(r * 0.6, r * 1.2, 0))
		"suitcase":
			Parts.mesh(self, Parts.box(Vector3(r * 1.6, r * 1.2, r * 0.6)), mat, Vector3(0, r * 0.6, 0))
			Parts.mesh(self, Parts.torus(r * 0.15, r * 0.22, 10), dark, Vector3(0, r * 1.25, 0), Vector3(PI / 2, 0, 0), Vector3(1.5, 1, 1))
		"chandelier":
			Parts.mesh(self, Parts.torus(r * 0.6, r * 0.75, 20), Mats.std("gold", Color(0.85, 0.65, 0.2), 0.3, 1.0), Vector3(0, r * 0.5, 0))
			for k in 8:
				var a = k * TAU / 8.0
				Parts.mesh(self, Parts.cyl(0.0, r * 0.12, r * 0.4, 6), Mats.std("crystal", Color(0.9, 0.95, 1.0), 0.02, 0.3), Vector3(cos(a) * r * 0.68, r * 0.25, sin(a) * r * 0.68),
					Vector3(PI, 0, 0))
		"duck":
			Parts.mesh(self, Parts.sphere(r * 0.6), mat, Vector3(0, r * 0.55, 0), Vector3.ZERO, Vector3(1.3, 0.9, 1))
			Parts.mesh(self, Parts.sphere(r * 0.35), mat, Vector3(r * 0.5, r * 1.2, 0))
			Parts.mesh(self, Parts.box(Vector3(r * 0.4, r * 0.1, r * 0.25)), Mats.std("beak", Color(1.0, 0.5, 0.1), 0.5), Vector3(r * 0.9, r * 1.15, 0))
			for z in [-0.12, 0.12]:
				Parts.eye(self, Vector3(r * 0.75, r * 1.3, r * z * 2.0), r * 0.06, Color(0.02, 0.02, 0.02), 0.2)
		"decoy":
			Parts.mesh(self, Parts.sphere(r * 0.8), mat, Vector3(0, r * 0.8, 0))
			glow_light = OmniLight3D.new()
			glow_light.light_color = Color(0.2, 1.0, 0.4)
			glow_light.light_energy = 0.0
			glow_light.omni_range = 3.0
			glow_light.position = Vector3(0, 0.3, 0)
			add_child(glow_light)
		_:
			# bric-à-brac : un tas de petites boîtes
			for k in 3:
				Parts.mesh(self, Parts.box(Vector3(r * 0.8, r * 0.5, r * 0.6)), mat, Vector3((k - 1) * r * 0.4, r * 0.25 + k * r * 0.2, 0), Vector3(0, k * 0.7, 0))
	for mi in find_children("*", "MeshInstance3D", true, false):
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON


func animate(s: Dictionary, dt: float, t: float) -> void:
	var falling = float(s.get("f", 0.0)) > 0
	if falling:
		spin += dt * 8.0
		rotation = Vector3(spin * 0.7, spin, 0)
	else:
		rotation.x = lerpf(rotation.x, 0.0, minf(1.0, dt * 6.0))
		rotation.z = 0.0
	if glow_light != null:
		var on = int(s.get("d", 0)) == 1 or int(s.get("fl", 0)) == 1
		glow_light.light_energy = (1.5 + sin(t * 20.0) * 0.6) if on else 0.0
		if int(s.get("fl", 0)) == 1:
			glow_light.light_color = Color(1.0, 0.25, 0.15)
			glow_light.omni_range = 7.0
