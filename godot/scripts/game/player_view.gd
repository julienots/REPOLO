# Employé de Récup'Express en 3D (joueurs et bots) : mêmes cosmétiques que la version 2D
# (couleur de combinaison, masque, chapeau, couleur de faisceau). Animation procédurale :
# marche / course / accroupi, à terre, porté d'objet, fantôme après la mort.
class_name PlayerView
extends Node3D

const T = WorldBuilder.T

var pid = ""
var cosmetics = {}
var rig = {}
var phase = 0.0
var flashlight: SpotLight3D
var beam_color = Color(1.0, 0.9, 0.67)
var is_local = false
var ghost_mat: StandardMaterial3D
var meshes = []
var state = "alive"
var target_pos = Vector3.ZERO
var target_yaw = 0.0
var wrong = false       # Dernier Invité : copie légèrement « fausse »


static func suit_color(cos: Dictionary) -> Color:
	for s in Data.db.COSMETICS.suit:
		if s.id == cos.get("suit", "orange"):
			return Color.html(s.color)
	return Color.html("#e67e22")


static func light_color(cos: Dictionary) -> Color:
	for s in Data.db.COSMETICS.light:
		if s.id == cos.get("light", "warm"):
			var c = String(s.color).split(",")
			return Color(float(c[0]) / 255.0, float(c[1]) / 255.0, float(c[2]) / 255.0)
	return Color(1.0, 0.9, 0.67)


func setup(id: String, cos: Dictionary, local := false, with_light := true) -> void:
	pid = id
	cosmetics = cos
	is_local = local
	beam_color = light_color(cos)
	var suit = suit_color(cos)
	var fabric = Mats.skin("suit_" + suit.to_html(false), {"base_color": suit, "dark_color": suit.darkened(0.45), "vein_color": suit.darkened(0.3),
		"rim_color": suit.lightened(0.3), "wetness": 0.05, "veins": 0.0, "rim": 0.1, "scale": 6.0})
	var skin = Mats.skin("human_skin", {"base_color": Color(0.78, 0.6, 0.5), "dark_color": Color(0.45, 0.3, 0.25), "vein_color": Color(0.6, 0.35, 0.35),
		"wetness": 0.2, "veins": 0.05, "rim": 0.2})
	var dark = Mats.std("boot", Color(0.08, 0.07, 0.06), 0.8)
	var reflect = Mats.std("reflective", Color(0.85, 0.85, 0.8), 0.25, 0.0, 0.3)
	var body = Parts.pivot(self, Vector3.ZERO)
	rig.body = body
	var hips = Parts.pivot(body, Vector3(0, 0.92, 0))
	rig.hips = hips
	rig.leg_l = Parts.limb(hips, Vector3(0, 0, -0.11), 0.48, 0.085, fabric)
	rig.leg_r = Parts.limb(hips, Vector3(0, 0, 0.11), 0.48, 0.085, fabric)
	rig.shin_l = Parts.limb(rig.leg_l, Vector3(0, -0.46, 0), 0.44, 0.075, fabric)
	rig.shin_r = Parts.limb(rig.leg_r, Vector3(0, -0.46, 0), 0.44, 0.075, fabric)
	for sh in [rig.shin_l, rig.shin_r]:
		Parts.mesh(sh, Parts.box(Vector3(0.26, 0.1, 0.13)), dark, Vector3(0.05, -0.44, 0))
	var torso = Parts.pivot(hips, Vector3(0, 0.0, 0))
	rig.torso = torso
	Parts.mesh(torso, Parts.capsule(0.2, 0.68), fabric, Vector3(0, 0.33, 0), Vector3.ZERO, Vector3(0.85, 1, 1.12))
	Parts.mesh(torso, Parts.box(Vector3(0.02, 0.05, 0.36)), reflect, Vector3(0.17, 0.3, 0))
	Parts.mesh(torso, Parts.box(Vector3(0.2, 0.36, 0.3)), Mats.std("pack", suit.darkened(0.6), 0.8), Vector3(-0.22, 0.38, 0))
	rig.arm_l = Parts.limb(torso, Vector3(0, 0.58, -0.25), 0.34, 0.07, fabric)
	rig.arm_r = Parts.limb(torso, Vector3(0, 0.58, 0.25), 0.34, 0.07, fabric)
	rig.fore_l = Parts.limb(rig.arm_l, Vector3(0, -0.33, 0), 0.32, 0.06, fabric)
	rig.fore_r = Parts.limb(rig.arm_r, Vector3(0, -0.33, 0), 0.32, 0.06, fabric)
	for f in [rig.fore_l, rig.fore_r]:
		Parts.mesh(f, Parts.sphere(0.055, 8), Mats.std("glove", Color(0.12, 0.12, 0.12), 0.7), Vector3(0, -0.33, 0))
	# lampe torche dans la main droite
	var torch = Parts.pivot(rig.fore_r, Vector3(0.05, -0.34, 0))
	Parts.mesh(torch, Parts.cyl(0.035, 0.03, 0.22, 10), Mats.std("torch", Color(0.15, 0.15, 0.16), 0.4, 0.8), Vector3(0.08, 0, 0), Vector3(0, 0, PI / 2))
	Parts.mesh(torch, Parts.cyl(0.04, 0.04, 0.01, 10), Mats.glow("lens_" + beam_color.to_html(false), beam_color, 3.0), Vector3(0.195, 0, 0), Vector3(0, 0, PI / 2))
	rig.torch = torch
	var neck = Parts.pivot(torso, Vector3(0, 0.7, 0))
	rig.head = neck
	Parts.mesh(neck, Parts.sphere(0.135), skin, Vector3(0, 0.14, 0), Vector3.ZERO, Vector3(1, 1.12, 0.95))
	_mask(neck, String(cos.get("mask", "visor")))
	_hat(neck, String(cos.get("hat", "helmet")), suit)
	if with_light and not local:
		flashlight = SpotLight3D.new()
		flashlight.light_color = beam_color
		flashlight.light_energy = 2.2
		flashlight.spot_range = 9.0 * T
		flashlight.spot_angle = 28.0
		flashlight.spot_attenuation = 1.2
		flashlight.shadow_enabled = false
		# le faisceau suit le buste (orienté vers +X), à hauteur de la main
		flashlight.rotation = Vector3(-0.08, -PI / 2, 0)
		torso.add_child(flashlight)
		flashlight.position = Vector3(0.5, 0.42, 0.22)
	for c in find_children("*", "MeshInstance3D", true, false):
		meshes.append(c)
	if local:
		# le joueur local ne voit pas sa propre tête (caméra à l'intérieur)
		neck.visible = false


func _mask(head: Node3D, kind: String) -> void:
	var black = Mats.std("mask_black", Color(0.03, 0.03, 0.035), 0.15, 0.3)
	match kind:
		"goggles":
			for z in [-0.05, 0.05]:
				Parts.mesh(head, Parts.cyl(0.04, 0.04, 0.04, 10), black, Vector3(0.12, 0.17, z), Vector3(0, 0, PI / 2))
			Parts.mesh(head, Parts.torus(0.13, 0.145), Mats.std("strap", Color(0.2, 0.15, 0.1), 0.9), Vector3(0, 0.17, 0), Vector3(0, 0, 0))
		"smile":
			Parts.mesh(head, Parts.sphere(0.13), Mats.std("mask_white", Color(0.9, 0.88, 0.82), 0.4), Vector3(0.03, 0.14, 0), Vector3.ZERO, Vector3(0.9, 1.05, 0.92))
			Parts.mesh(head, Parts.torus(0.05, 0.06), black, Vector3(0.14, 0.1, 0), Vector3(0, 0, PI / 2), Vector3(1, 1, 1.3))
			for z in [-0.045, 0.045]:
				Parts.mesh(head, Parts.sphere(0.018, 6), black, Vector3(0.145, 0.19, z))
		"gas":
			Parts.mesh(head, Parts.sphere(0.12), Mats.std("gas", Color(0.22, 0.25, 0.2), 0.6), Vector3(0.05, 0.13, 0), Vector3.ZERO, Vector3(0.9, 1.0, 0.95))
			Parts.mesh(head, Parts.cyl(0.05, 0.06, 0.1, 10), black, Vector3(0.17, 0.07, 0), Vector3(0, 0, PI / 2))
			for z in [-0.05, 0.05]:
				Parts.mesh(head, Parts.cyl(0.035, 0.035, 0.02, 10), Mats.std("gas_lens", Color(0.3, 0.35, 0.3), 0.05, 0.5), Vector3(0.14, 0.18, z), Vector3(0, 0, PI / 2))
		"paper":
			Parts.mesh(head, Parts.box(Vector3(0.3, 0.36, 0.3)), Mats.std("paper", Color(0.62, 0.5, 0.33), 0.95), Vector3(0, 0.15, 0))
			for z in [-0.06, 0.06]:
				Parts.mesh(head, Parts.sphere(0.025, 6), black, Vector3(0.15, 0.2, z))
		"hockey":
			Parts.mesh(head, Parts.sphere(0.135), Mats.std("hockey", Color(0.85, 0.83, 0.75), 0.5), Vector3(0.025, 0.14, 0), Vector3.ZERO, Vector3(0.9, 1.1, 0.95))
			for i in 6:
				Parts.mesh(head, Parts.sphere(0.012, 6), black, Vector3(0.15, 0.08 + (i % 3) * 0.03, -0.03 + floor(i / 3.0) * 0.06))
			Parts.mesh(head, Parts.box(Vector3(0.02, 0.02, 0.06)), Mats.std("hockey_red", Color(0.6, 0.05, 0.05), 0.5), Vector3(0.15, 0.2, 0.05), Vector3(0.5, 0, 0))
		"cyclops":
			Parts.mesh(head, Parts.cyl(0.06, 0.06, 0.05, 12), black, Vector3(0.13, 0.17, 0), Vector3(0, 0, PI / 2))
			Parts.eye(head, Vector3(0.16, 0.17, 0), 0.03, Color(1.0, 0.25, 0.1), 3.0)
		_:
			Parts.mesh(head, Parts.sphere(0.1), Mats.std("visor", Color(0.04, 0.06, 0.08), 0.05, 0.8), Vector3(0.06, 0.17, 0), Vector3.ZERO, Vector3(0.7, 0.55, 1.05))


func _hat(head: Node3D, kind: String, suit: Color) -> void:
	match kind:
		"helmet":
			Parts.mesh(head, Parts.sphere(0.155), Mats.std("helmet", Color(0.95, 0.75, 0.1), 0.35), Vector3(0, 0.2, 0), Vector3.ZERO, Vector3(1.05, 0.75, 1.05))
			Parts.mesh(head, Parts.cyl(0.19, 0.19, 0.015, 16), Mats.std("helmet", Color(0.95, 0.75, 0.1), 0.35), Vector3(0.02, 0.2, 0))
		"beanie":
			Parts.mesh(head, Parts.sphere(0.145), Mats.std("beanie", suit.darkened(0.3), 0.95), Vector3(0, 0.21, 0), Vector3.ZERO, Vector3(1, 0.8, 1))
		"cap":
			Parts.mesh(head, Parts.sphere(0.14), Mats.std("cap", suit.darkened(0.2), 0.8), Vector3(0, 0.22, 0), Vector3.ZERO, Vector3(1, 0.6, 1))
			Parts.mesh(head, Parts.box(Vector3(0.16, 0.012, 0.18)), Mats.std("cap", suit.darkened(0.2), 0.8), Vector3(0.15, 0.24, 0))
		"crown":
			Parts.mesh(head, Parts.cyl(0.13, 0.12, 0.1, 8), Mats.std("crown", Color(0.85, 0.7, 0.2), 0.6), Vector3(0, 0.33, 0))
		"antenna":
			Parts.mesh(head, Parts.cyl(0.006, 0.006, 0.25, 6), Mats.std("chrome", Color(0.7, 0.7, 0.72), 0.2, 1.0), Vector3(0, 0.4, 0))
			Parts.eye(head, Vector3(0, 0.53, 0), 0.025, Color(1.0, 0.2, 0.2), 3.0)
		"chef":
			Parts.mesh(head, Parts.cyl(0.13, 0.11, 0.22, 12), Mats.std("chef", Color(0.95, 0.95, 0.93), 0.9), Vector3(0, 0.38, 0))
		"party":
			Parts.mesh(head, Parts.cyl(0.0, 0.1, 0.25, 12), Mats.std("party", Color(0.9, 0.2, 0.6), 0.6), Vector3(0, 0.42, 0))


# s : entrée « joueur » de l'instantané ; dt : temps écoulé ; t : temps absolu
func animate(s: Dictionary, dt: float, t: float) -> void:
	var st = String(s.st)
	if st != state:
		_set_state(st)
	var speed = float(s.get("sp", 0.0))
	var moving = speed > 0.25
	var mode = String(s.get("m", "walk"))
	phase += dt * (speed * 2.8 if moving else 0.0)
	var sw = sin(phase) * (0.65 if mode == "sprint" else 0.45) * clampf(speed / 2.0, 0.0, 1.0)
	var crouch = mode == "sneak" and st == "alive"
	rig.leg_l.rotation.z = sw
	rig.leg_r.rotation.z = -sw
	rig.shin_l.rotation.z = -maxf(0.0, -sw) * 1.2 - (0.6 if crouch else 0.0)
	rig.shin_r.rotation.z = -maxf(0.0, sw) * 1.2 - (0.6 if crouch else 0.0)
	rig.hips.position.y = (0.72 if crouch else 0.92) + absf(cos(phase)) * 0.03 * clampf(speed / 2.0, 0.0, 1.0)
	rig.torso.rotation.z = -(0.35 if crouch else 0.0) - (0.15 if mode == "sprint" else 0.0)
	var carrying = s.get("c") != null
	if carrying:
		rig.arm_l.rotation.z = 1.2
		rig.arm_r.rotation.z = 1.2
		rig.fore_l.rotation.z = 0.4
		rig.fore_r.rotation.z = 0.4
	else:
		rig.arm_l.rotation.z = -sw * 0.8
		rig.arm_r.rotation.z = 1.25 + sw * 0.1     # bras droit tendu : il éclaire devant lui
		rig.fore_l.rotation.z = 0.25
		rig.fore_r.rotation.z = 0.1
	if wrong:
		rig.head.rotation.x = 0.35 + sin(t * 0.7) * 0.1
	# respiration / panique
	rig.torso.scale = Vector3(1, 1.0 + sin(t * (5.0 if s.get("hu", 0) else 1.6)) * 0.015, 1)
	if flashlight:
		flashlight.visible = int(s.get("l", 0)) == 1 and st == "alive" and s.get("h") == null and not wrong
		if int(s.get("fl", 0)) == 1 and fmod(t * 13.0, 1.0) < 0.4:
			flashlight.visible = false
	visible = s.get("h") == null and st != "extracted"


func _set_state(st: String) -> void:
	state = st
	rig.body.rotation = Vector3.ZERO
	rig.body.position = Vector3.ZERO
	match st:
		"downed":
			rig.body.rotation.z = PI / 2 * 0.92
			rig.body.position.y = 0.18
			rig.body.position.x = 0.8
		"dead":
			if ghost_mat == null:
				ghost_mat = StandardMaterial3D.new()
				ghost_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
				ghost_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
				ghost_mat.albedo_color = Color(0.6, 0.8, 1.0, 0.18)
			for m in meshes:
				m.material_override = ghost_mat
				m.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
			rig.body.position.y = 0.25
			if flashlight:
				flashlight.visible = false
