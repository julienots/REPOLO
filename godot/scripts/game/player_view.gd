# Récupérateur de Récup'Express en 3D (joueurs et bots) : personnage original tout rond —
# corps-galet, lunettes doubles réglementaires, lampe frontale, hotte de récup dans le dos,
# petits bras à moufles. Mêmes cosmétiques que la version 2D (couleur de combinaison,
# masque, chapeau, couleur de faisceau). Animation procédurale : démarche dandinée,
# course penchée, accroupi écrasé, à terre, porté d'objet, fantôme après la mort.
class_name PlayerView
extends Node3D

const T = WorldBuilder.T
const BODY_R = 0.36          # rayon du corps-galet
const FACE_Y = 0.8           # hauteur des lunettes au-dessus des hanches
const HIPS_Y = 0.3

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
var squash = 0.0        # écrasement à chaque pas (rebond)
var spin = 0.0          # tour sur soi-même (casier : aperçu qui tourne)


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
	var fabric = Mats.std("suit_" + suit.to_html(false), suit, 0.55)
	var fabric_dark = Mats.std("suitd_" + suit.to_html(false), suit.darkened(0.35), 0.7)
	var ink = Mats.std("recup_ink", Color(0.09, 0.1, 0.12), 0.6)
	var reflect = Mats.std("reflective", Color(0.9, 0.89, 0.84), 0.25, 0.0, 0.25)
	var body = Parts.pivot(self, Vector3.ZERO)
	rig.body = body
	var hips = Parts.pivot(body, Vector3(0, HIPS_Y, 0))
	rig.hips = hips
	# petites jambes trapues + bottes
	rig.leg_l = Parts.limb(hips, Vector3(0, 0.02, -0.15), 0.2, 0.1, fabric_dark)
	rig.leg_r = Parts.limb(hips, Vector3(0, 0.02, 0.15), 0.2, 0.1, fabric_dark)
	rig.shin_l = Parts.pivot(rig.leg_l, Vector3(0, -0.2, 0))
	rig.shin_r = Parts.pivot(rig.leg_r, Vector3(0, -0.2, 0))
	for sh in [rig.shin_l, rig.shin_r]:
		Parts.mesh(sh, Parts.capsule(0.08, 0.3), ink, Vector3(0.05, -0.06, 0), Vector3(0, 0, PI / 2), Vector3(1, 1, 1.15))
	# corps-galet (plus large en bas)
	var torso = Parts.pivot(hips, Vector3.ZERO)
	rig.torso = torso
	Parts.mesh(torso, Parts.capsule(BODY_R, 1.08), fabric, Vector3(0, 0.52, 0), Vector3.ZERO, Vector3(1, 1, 1.04))
	Parts.mesh(torso, Parts.sphere(BODY_R + 0.035, 20), fabric, Vector3(0, 0.3, 0), Vector3.ZERO, Vector3(1, 0.85, 1.06))
	# bande réfléchissante à la taille
	Parts.mesh(torso, Parts.cyl(BODY_R + 0.045, BODY_R + 0.05, 0.07, 24), reflect, Vector3(0, 0.27, 0), Vector3.ZERO, Vector3(1, 1, 1.06))
	# écusson RX sur le ventre (disque sombre + pastille couleur lampe)
	Parts.mesh(torso, Parts.cyl(0.075, 0.075, 0.02, 14), ink, Vector3(BODY_R + 0.02, 0.48, 0.16), Vector3(0, 0, -PI / 2))
	Parts.mesh(torso, Parts.cyl(0.04, 0.04, 0.022, 12), Mats.std("rx_badge", Color(1.0, 0.9, 0.66), 0.4, 0.0, 0.4), Vector3(BODY_R + 0.03, 0.48, 0.16), Vector3(0, 0, -PI / 2))
	# hotte de récup dans le dos, avec sangles et poche
	var pack = Parts.pivot(torso, Vector3(-BODY_R - 0.06, 0.5, 0))
	rig.pack = pack
	Parts.mesh(pack, Parts.box(Vector3(0.24, 0.6, 0.48)), fabric_dark, Vector3.ZERO)
	Parts.mesh(pack, Parts.box(Vector3(0.26, 0.06, 0.5)), ink, Vector3(0, 0.27, 0))
	Parts.mesh(pack, Parts.box(Vector3(0.05, 0.18, 0.3)), ink, Vector3(-0.13, -0.08, 0))
	for z in [-0.17, 0.17]:
		Parts.mesh(torso, Parts.box(Vector3(0.06, 0.04, 0.05)), ink, Vector3(-BODY_R + 0.01, 0.78, z))
	# petits bras à moufles
	rig.arm_l = Parts.limb(torso, Vector3(0, 0.58, -BODY_R - 0.03), 0.24, 0.075, fabric)
	rig.arm_r = Parts.limb(torso, Vector3(0, 0.58, BODY_R + 0.03), 0.24, 0.075, fabric)
	rig.fore_l = Parts.pivot(rig.arm_l, Vector3(0, -0.24, 0))
	rig.fore_r = Parts.pivot(rig.arm_r, Vector3(0, -0.24, 0))
	for f in [rig.fore_l, rig.fore_r]:
		Parts.mesh(f, Parts.sphere(0.095, 12), ink, Vector3(0, -0.04, 0), Vector3.ZERO, Vector3(1, 1.1, 0.9))
	# lampe torche tenue dans la moufle droite
	var torch = Parts.pivot(rig.fore_r, Vector3(0.05, -0.06, 0))
	Parts.mesh(torch, Parts.cyl(0.035, 0.03, 0.22, 10), Mats.std("torch", Color(0.15, 0.15, 0.16), 0.4, 0.8), Vector3(0.08, 0, 0), Vector3(0, 0, PI / 2))
	Parts.mesh(torch, Parts.cyl(0.04, 0.04, 0.01, 10), Mats.glow("lens_" + beam_color.to_html(false), beam_color, 3.0), Vector3(0.195, 0, 0), Vector3(0, 0, PI / 2))
	rig.torch = torch
	# « tête » : le haut du galet porte les lunettes, la lampe frontale, le masque et le chapeau
	var head = Parts.pivot(torso, Vector3(0, FACE_Y, 0))
	rig.head = head
	_mask(head, String(cos.get("mask", "visor")), beam_color)
	_hat(head, String(cos.get("hat", "helmet")), suit)
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
		flashlight.position = Vector3(0.55, 0.5, 0.3)
	for c in find_children("*", "MeshInstance3D", true, false):
		meshes.append(c)
	if local:
		# le joueur local ne voit pas son propre visage (caméra à l'intérieur) et son corps
		# ne doit pas masquer sa propre lampe
		head.visible = false
		for m in meshes:
			m.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF


# Position d'un point à la surface avant du galet, à la hauteur dy (relative aux lunettes)
# et au décalage latéral z.
static func _front(dy: float, z: float, out := 0.0) -> Vector3:
	var cy = 0.52 + 0.54 - BODY_R       # centre de la calotte du galet
	var y = FACE_Y + dy
	var r2 = BODY_R * BODY_R - maxf(0.0, y - cy) * maxf(0.0, y - cy) - z * z
	return Vector3(sqrt(maxf(0.01, r2)) + out, dy, z)


func _mask(head: Node3D, kind: String, lamp: Color) -> void:
	var ink = Mats.std("recup_ink", Color(0.09, 0.1, 0.12), 0.6)
	var black = Mats.std("mask_black", Color(0.03, 0.03, 0.035), 0.15, 0.3)
	var shine = Mats.std("goggle_shine", Color(1, 1, 1), 0.1, 0.0, 1.0)
	match kind:
		"goggles":
			# lunettes de soudeur : gros verres fumés cerclés de cuivre
			Parts.mesh(head, Parts.torus(BODY_R - 0.02, BODY_R + 0.03, 24), Mats.std("strap", Color(0.25, 0.17, 0.1), 0.9), Vector3(0, 0.02, 0), Vector3.ZERO, Vector3(1, 1.4, 1.04))
			for z in [-0.14, 0.14]:
				var at = _front(0.02, z, 0.02)
				Parts.mesh(head, Parts.cyl(0.13, 0.13, 0.1, 16), Mats.std("copper", Color(0.72, 0.42, 0.2), 0.35, 0.8), at, Vector3(0, 0, PI / 2))
				Parts.mesh(head, Parts.cyl(0.1, 0.1, 0.02, 16), Mats.std("smoked", Color(0.12, 0.2, 0.12), 0.05, 0.4), at + Vector3(0.05, 0, 0), Vector3(0, 0, PI / 2))
		"smile":
			Parts.mesh(head, Parts.sphere(0.26, 18), Mats.std("mask_white", Color(0.92, 0.9, 0.84), 0.4), _front(0.0, 0.0, -0.17), Vector3.ZERO, Vector3(0.45, 1.0, 1.15))
			Parts.mesh(head, Parts.torus(0.08, 0.1), black, _front(-0.08, 0.0, 0.0), Vector3(0, 0, PI / 2), Vector3(1, 1, 1.4))
			for z in [-0.08, 0.08]:
				Parts.mesh(head, Parts.sphere(0.03, 8), black, _front(0.06, z, 0.0))
		"gas":
			Parts.mesh(head, Parts.torus(BODY_R - 0.02, BODY_R + 0.02, 24), ink, Vector3(0, 0.02, 0), Vector3.ZERO, Vector3(1, 1.2, 1.04))
			Parts.mesh(head, Parts.cyl(0.09, 0.11, 0.16, 12), Mats.std("gas", Color(0.22, 0.25, 0.2), 0.6), _front(-0.12, 0.0, 0.04), Vector3(0, 0, PI / 2))
			Parts.mesh(head, Parts.cyl(0.07, 0.07, 0.04, 12), black, _front(-0.12, 0.0, 0.13), Vector3(0, 0, PI / 2))
			for z in [-0.13, 0.13]:
				Parts.mesh(head, Parts.cyl(0.08, 0.08, 0.06, 14), Mats.std("gas_lens", Color(0.3, 0.38, 0.32), 0.05, 0.5), _front(0.05, z, 0.0), Vector3(0, 0, PI / 2))
		"paper":
			Parts.mesh(head, Parts.box(Vector3(0.78, 0.6, 0.78)), Mats.std("paper", Color(0.62, 0.5, 0.33), 0.95), Vector3(0, 0.12, 0))
			for z in [-0.12, 0.12]:
				Parts.mesh(head, Parts.sphere(0.045, 8), black, Vector3(0.39, 0.14, z), Vector3.ZERO, Vector3(0.4, 1, 1))
		"hockey":
			Parts.mesh(head, Parts.sphere(0.27, 18), Mats.std("hockey", Color(0.88, 0.86, 0.78), 0.5), _front(-0.02, 0.0, -0.17), Vector3.ZERO, Vector3(0.45, 1.1, 1.1))
			for i in 6:
				Parts.mesh(head, Parts.sphere(0.02, 6), black, _front(-0.12 + (i % 3) * 0.06, -0.06 + floor(i / 3.0) * 0.12, 0.0))
			Parts.mesh(head, Parts.box(Vector3(0.02, 0.03, 0.1)), Mats.std("hockey_red", Color(0.6, 0.05, 0.05), 0.5), _front(0.12, 0.08, 0.0), Vector3(0.5, 0, 0))
		"cyclops":
			Parts.mesh(head, Parts.torus(BODY_R - 0.02, BODY_R + 0.03, 24), ink, Vector3(0, 0.02, 0), Vector3.ZERO, Vector3(1, 1.3, 1.04))
			Parts.mesh(head, Parts.cyl(0.15, 0.15, 0.1, 18), black, _front(0.02, 0.0, 0.02), Vector3(0, 0, PI / 2))
			Parts.eye(head, _front(0.02, 0.0, 0.07), 0.07, Color(1.0, 0.25, 0.1), 3.0)
		_:
			# lunettes doubles réglementaires Récup'Express (signature du personnage)
			Parts.mesh(head, Parts.torus(BODY_R - 0.02, BODY_R + 0.03, 24), ink, Vector3(0, 0.0, 0), Vector3.ZERO, Vector3(1, 1.5, 1.04))
			var lens = Mats.std("goggle_lens_" + lamp.to_html(false), lamp, 0.15, 0.0, 0.35)
			for z in [-0.13, 0.13]:
				var at = _front(0.0, z, 0.0)
				Parts.mesh(head, Parts.cyl(0.125, 0.125, 0.1, 18), ink, at, Vector3(0, 0, PI / 2))
				Parts.mesh(head, Parts.cyl(0.088, 0.088, 0.02, 18), lens, at + Vector3(0.05, 0, 0), Vector3(0, 0, PI / 2))
				Parts.mesh(head, Parts.sphere(0.022, 8), shine, at + Vector3(0.06, 0.035, -0.03))
	# lampe frontale au-dessus des lunettes (sauf sac en papier)
	if kind != "paper":
		var lamp_at = _front(0.17, 0.0, -0.02)
		Parts.mesh(head, Parts.box(Vector3(0.1, 0.09, 0.15)), Mats.std("headlamp", Color(0.18, 0.2, 0.23), 0.5, 0.3), lamp_at)
		Parts.mesh(head, Parts.cyl(0.035, 0.035, 0.02, 10), Mats.glow("lens_" + lamp.to_html(false), lamp, 2.0), lamp_at + Vector3(0.055, 0, 0), Vector3(0, 0, PI / 2))


func _hat(head: Node3D, kind: String, suit: Color) -> void:
	var top = 0.26      # sommet du galet au-dessus des lunettes
	match kind:
		"helmet":
			var y = Mats.std("helmet", Color(0.95, 0.75, 0.1), 0.35)
			Parts.mesh(head, Parts.sphere(0.3, 20), y, Vector3(-0.02, top - 0.05, 0), Vector3.ZERO, Vector3(1, 0.55, 1))
			Parts.mesh(head, Parts.cyl(0.34, 0.34, 0.025, 24), y, Vector3(0.03, top - 0.08, 0))
			Parts.mesh(head, Parts.box(Vector3(0.4, 0.05, 0.05)), y, Vector3(-0.02, top + 0.1, 0))
		"beanie":
			Parts.mesh(head, Parts.sphere(0.3, 18), Mats.std("beanie", suit.darkened(0.3), 0.95), Vector3(-0.02, top - 0.04, 0), Vector3.ZERO, Vector3(1, 0.6, 1))
			Parts.mesh(head, Parts.sphere(0.07, 10), Mats.std("pompom", Color(0.95, 0.93, 0.88), 0.95), Vector3(-0.02, top + 0.14, 0))
		"cap":
			Parts.mesh(head, Parts.sphere(0.29, 18), Mats.std("cap", suit.darkened(0.2), 0.8), Vector3(-0.02, top - 0.05, 0), Vector3.ZERO, Vector3(1, 0.5, 1))
			Parts.mesh(head, Parts.box(Vector3(0.26, 0.02, 0.3)), Mats.std("cap", suit.darkened(0.2), 0.8), Vector3(0.3, top - 0.06, 0), Vector3(0, 0, -0.15))
		"crown":
			var g = Mats.std("crown", Color(0.85, 0.7, 0.2), 0.6)
			Parts.mesh(head, Parts.cyl(0.2, 0.19, 0.12, 10), g, Vector3(0, top + 0.02, 0))
			for i in 5:
				var a = TAU * i / 5.0
				Parts.mesh(head, Parts.prism(Vector3(0.08, 0.09, 0.03)), g, Vector3(cos(a) * 0.19, top + 0.12, sin(a) * 0.19), Vector3(0, -a + PI / 2, 0))
		"antenna":
			Parts.mesh(head, Parts.cyl(0.008, 0.008, 0.3, 6), Mats.std("chrome", Color(0.7, 0.7, 0.72), 0.2, 1.0), Vector3(-0.05, top + 0.14, 0))
			Parts.eye(head, Vector3(-0.05, top + 0.3, 0), 0.035, Color(1.0, 0.2, 0.2), 3.0)
		"chef":
			var w = Mats.std("chef", Color(0.95, 0.95, 0.93), 0.9)
			Parts.mesh(head, Parts.cyl(0.2, 0.18, 0.2, 14), w, Vector3(0, top + 0.06, 0))
			Parts.mesh(head, Parts.sphere(0.24, 14), w, Vector3(0, top + 0.2, 0), Vector3.ZERO, Vector3(1, 0.55, 1))
		"party":
			Parts.mesh(head, Parts.cyl(0.0, 0.14, 0.32, 12), Mats.std("party", Color(0.9, 0.2, 0.6), 0.6), Vector3(0, top + 0.12, 0), Vector3(0, 0, 0.12))
			Parts.mesh(head, Parts.sphere(0.04, 8), Mats.std("party_dot", Color(1.0, 0.85, 0.2), 0.6), Vector3(0.03, top + 0.29, 0))


# s : entrée « joueur » de l'instantané ; dt : temps écoulé ; t : temps absolu
func animate(s: Dictionary, dt: float, t: float) -> void:
	var st = String(s.st)
	if st != state:
		_set_state(st)
	var speed = float(s.get("sp", 0.0))
	var moving = speed > 0.25
	var mode = String(s.get("m", "walk"))
	var k = clampf(speed / 2.0, 0.0, 1.0)
	var prev = phase
	phase += dt * (speed * 3.4 if moving else 0.0)
	# un pas à chaque demi-période : petit écrasement (rebond « gélatine »)
	if moving and floor(prev / PI) != floor(phase / PI):
		squash = 0.07 if mode != "sneak" else 0.03
	squash = maxf(0.0, squash - dt * 0.45)
	var sw = sin(phase) * (0.75 if mode == "sprint" else 0.55) * k
	var crouch = mode == "sneak" and st == "alive"
	rig.leg_l.rotation.z = sw
	rig.leg_r.rotation.z = -sw
	rig.shin_l.rotation.z = -maxf(0.0, -sw) * 0.6
	rig.shin_r.rotation.z = -maxf(0.0, sw) * 0.6
	rig.hips.position.y = (HIPS_Y - 0.1 if crouch else HIPS_Y) + absf(cos(phase)) * 0.05 * k
	# démarche dandinée : le galet roule d'un côté à l'autre, penche en avant en courant
	rig.torso.rotation.x = sin(phase) * 0.12 * k
	rig.torso.rotation.z = -(0.12 if crouch else 0.0) - (0.22 if mode == "sprint" else 0.06 * k)
	var breathe = sin(t * (6.0 if s.get("hu", 0) else 1.8)) * 0.02
	var sy = 1.0 - squash + breathe - (0.12 if crouch else 0.0)
	var sxz = 1.0 + squash * 0.7 - breathe * 0.5 + (0.06 if crouch else 0.0)
	rig.torso.scale = Vector3(sxz, sy, sxz)
	rig.pack.rotation.x = -sin(phase) * 0.08 * k
	var carrying = s.get("c") != null
	if carrying:
		rig.arm_l.rotation.z = 1.45
		rig.arm_r.rotation.z = 1.45
		rig.arm_l.rotation.x = 0.25
		rig.arm_r.rotation.x = -0.25
	else:
		rig.arm_l.rotation.z = -sw * 1.1
		rig.arm_l.rotation.x = -0.25
		rig.arm_r.rotation.z = 1.3 + sw * 0.1     # bras droit tendu : il éclaire devant lui
		rig.arm_r.rotation.x = 0.1
	# la torche reste à l'horizontale, pointée devant, quel que soit l'angle du bras
	rig.torch.rotation.z = -rig.arm_r.rotation.z
	if s.get("hu", 0) and st == "alive":
		# panique : petits tremblements
		rig.head.rotation.y = sin(t * 31.0) * 0.04
	else:
		rig.head.rotation.y = 0.0
	if wrong:
		rig.head.rotation.x = 0.35 + sin(t * 0.7) * 0.1
	if spin != 0.0:
		rig.body.rotation.y += dt * spin
	if state == "dead":
		rig.body.position.y = 0.25 + sin(t * 1.5) * 0.08
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
			# à plat ventre, la hotte vers le ciel
			rig.body.rotation.z = -PI / 2 * 0.95
			rig.body.position.y = 0.4
			rig.body.position.x = -0.3
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
