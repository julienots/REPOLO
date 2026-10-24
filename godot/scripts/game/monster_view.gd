# Les huit créatures en 3D, version « horreur » : modèles procéduraux (peau humide veinée,
# plastique fissuré, carton détrempé, os), yeux luisants, animations par état (rôde,
# chasse, écoute, charge, sonné...) et tics nerveux. Chaque créature garde les indices
# visuels/sonores de la version 2D (cliquetis, lanterne, cloche, déguisement...).
class_name MonsterView
extends Node3D

var mid = ""
var type = ""
var rig = {}
var phase = 0.0
var twitch_t = 0.0
var last = {}
var lights = []
var pose_seed = 0
var disguise_view: PlayerView
var true_form: Node3D
var cur_yaw = 0.0
var players_cos = {}    # id -> cosmétiques (Dernier Invité)


func setup(id: String, kind: String, roster_cos: Dictionary) -> void:
	mid = id
	type = kind
	players_cos = roster_cos
	match kind:
		"sourdine":
			_build_sourdine()
		"inspecteur":
			_build_inspecteur()
		"mannequine":
			_build_mannequine()
		"demenageur":
			_build_demenageur()
		"berger":
			_build_berger()
		"echo":
			_build_echo()
		"sauveteur":
			_build_sauveteur()
		"invite":
			_build_invite()
	for mi in find_children("*", "MeshInstance3D", true, false):
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON


func _flesh(key: String, base: Color, dark: Color, veins := 0.6, wet := 0.7) -> ShaderMaterial:
	return Mats.skin(key, {"base_color": base, "dark_color": dark, "vein_color": Color(0.35, 0.04, 0.08), "rim_color": base.lightened(0.4),
		"wetness": wet, "veins": veins, "rim": 0.45, "scale": 2.6})


# ------------------------------------------------------------------ LA SOURDINE
func _build_sourdine() -> void:
	var skin = _flesh("sourdine", Color(0.62, 0.55, 0.52), Color(0.25, 0.17, 0.17), 0.8, 0.8)
	var inner = Mats.std("ear_inner", Color(0.25, 0.04, 0.05), 0.25)
	var root = Parts.pivot(self, Vector3.ZERO)
	rig.root = root
	var hips = Parts.pivot(root, Vector3(0, 1.25, 0))
	rig.hips = hips
	for side in [-1, 1]:
		var thigh = Parts.limb(hips, Vector3(0, 0, side * 0.13), 0.7, 0.07, skin)
		var shin = Parts.limb(thigh, Vector3(0, -0.68, 0), 0.62, 0.05, skin)
		Parts.mesh(shin, Parts.box(Vector3(0.28, 0.04, 0.09)), skin, Vector3(0.1, -0.62, 0))
		rig["thigh%d" % side] = thigh
		rig["shin%d" % side] = shin
	var torso = Parts.pivot(hips, Vector3.ZERO)
	rig.torso = torso
	Parts.mesh(torso, Parts.capsule(0.15, 0.85), skin, Vector3(0, 0.45, 0), Vector3.ZERO, Vector3(0.7, 1, 1))
	# côtes saillantes
	for i in 6:
		Parts.mesh(torso, Parts.torus(0.1, 0.125, 12), skin, Vector3(0.0, 0.42 + i * 0.075, 0), Vector3(0, 0, 0.12), Vector3(0.75, 0.5, 1.05))
	for side in [-1, 1]:
		var arm = Parts.limb(torso, Vector3(0, 0.82, side * 0.2), 0.62, 0.045, skin)
		var fore = Parts.limb(arm, Vector3(0, -0.6, 0), 0.6, 0.04, skin)
		# longs doigts
		for f in 4:
			Parts.mesh(fore, Parts.cyl(0.006, 0.012, 0.28, 6), skin, Vector3(0.02, -0.72, (f - 1.5) * 0.025), Vector3(0, 0, 0.15 * (f - 1.5)))
		rig["arm%d" % side] = arm
		rig["fore%d" % side] = fore
	var neck = Parts.pivot(torso, Vector3(0, 0.95, 0))
	rig.head = neck
	Parts.mesh(neck, Parts.cyl(0.05, 0.07, 0.25, 10), skin, Vector3(0, 0.1, 0))
	# tête-cornet : un énorme pavillon d'oreille charnu tourné vers l'avant
	var horn = Parts.pivot(neck, Vector3(0.05, 0.3, 0), Vector3(0, 0, -1.25))
	Parts.mesh(horn, Parts.cyl(0.38, 0.09, 0.75, 20), skin, Vector3(0, 0.3, 0))
	Parts.mesh(horn, Parts.cyl(0.35, 0.02, 0.72, 20), inner, Vector3(0, 0.32, 0))
	Parts.mesh(horn, Parts.torus(0.33, 0.42, 24), skin, Vector3(0, 0.68, 0))
	# bouche : fente verticale garnie de dents, sous le cornet
	var jaw = Parts.pivot(neck, Vector3(0.1, 0.18, 0))
	rig.jaw = jaw
	Parts.mesh(jaw, Parts.box(Vector3(0.03, 0.16, 0.08)), inner, Vector3(0.01, 0, 0))
	Parts.teeth(jaw, 6, 0.07, 0.035, Vector3(0.03, 0.06, 0), true, true)
	Parts.teeth(jaw, 6, 0.07, 0.035, Vector3(0.03, -0.06, 0), false, true)


# ------------------------------------------------------------------ L'INSPECTEUR
func _build_inspecteur() -> void:
	var coat = Mats.skin("insp_coat", {"base_color": Color(0.12, 0.12, 0.14), "dark_color": Color(0.03, 0.03, 0.04), "vein_color": Color(0.1, 0.1, 0.1),
		"wetness": 0.35, "veins": 0.0, "rim": 0.15, "scale": 5.0})
	var porcelain = Mats.skin("insp_face", {"base_color": Color(0.88, 0.86, 0.8), "dark_color": Color(0.55, 0.52, 0.48), "vein_color": Color(0.2, 0.15, 0.12),
		"wetness": 0.0, "veins": 0.3, "rim": 0.3, "plastic": 0.6, "scale": 3.0})
	var root = Parts.pivot(self, Vector3.ZERO)
	rig.root = root
	var hips = Parts.pivot(root, Vector3(0, 1.0, 0))
	rig.hips = hips
	for side in [-1, 1]:
		var leg = Parts.limb(hips, Vector3(0, 0, side * 0.12), 0.95, 0.07, coat)
		Parts.mesh(leg, Parts.box(Vector3(0.3, 0.08, 0.12)), Mats.std("shoe", Color(0.02, 0.02, 0.02), 0.2), Vector3(0.06, -0.97, 0))
		rig["thigh%d" % side] = leg
	var torso = Parts.pivot(hips, Vector3.ZERO)
	rig.torso = torso
	Parts.mesh(torso, Parts.cyl(0.2, 0.36, 1.25, 16), coat, Vector3(0, 0.1, 0))
	Parts.mesh(torso, Parts.capsule(0.21, 0.7), coat, Vector3(0, 0.55, 0), Vector3.ZERO, Vector3(0.8, 1, 1.15))
	for i in 4:
		Parts.mesh(torso, Parts.sphere(0.018, 6), Mats.std("brass", Color(0.7, 0.55, 0.2), 0.3, 1.0), Vector3(0.19, 0.25 + i * 0.13, 0))
	for side in [-1, 1]:
		var arm = Parts.limb(torso, Vector3(0, 0.85, side * 0.26), 0.45, 0.06, coat)
		var fore = Parts.limb(arm, Vector3(0, -0.44, 0), 0.45, 0.05, coat)
		Parts.mesh(fore, Parts.sphere(0.05, 8), Mats.std("glove_white", Color(0.85, 0.85, 0.82), 0.6), Vector3(0, -0.47, 0))
		rig["arm%d" % side] = arm
		rig["fore%d" % side] = fore
	# lanterne (main gauche) — indice : lueur jaune qui se balance
	var lantern = Parts.pivot(rig["fore-1"], Vector3(0, -0.5, 0))
	rig.lantern = lantern
	Parts.mesh(lantern, Parts.box(Vector3(0.12, 0.18, 0.12)), Mats.glow("insp_lantern", Color(1.0, 0.75, 0.3), 2.5), Vector3(0, -0.12, 0))
	var l = OmniLight3D.new()
	l.light_color = Color(1.0, 0.72, 0.3)
	l.light_energy = 1.1
	l.omni_range = 4.5
	l.position = Vector3(0, -0.12, 0)
	lantern.add_child(l)
	lights.append(l)
	# registre (main droite)
	Parts.mesh(rig.fore1, Parts.box(Vector3(0.3, 0.02, 0.22)), Mats.std("clipboard", Color(0.45, 0.32, 0.18), 0.8), Vector3(0.1, -0.5, 0), Vector3(0, 0, 0.8))
	# cou trop long, masque de porcelaine, casquette d'uniforme
	var neck = Parts.pivot(torso, Vector3(0, 0.95, 0))
	rig.head = neck
	Parts.mesh(neck, Parts.cyl(0.05, 0.06, 0.42, 10), Mats.std("neck_grey", Color(0.55, 0.52, 0.5), 0.6), Vector3(0, 0.2, 0))
	var head = Parts.pivot(neck, Vector3(0, 0.48, 0))
	Parts.mesh(head, Parts.sphere(0.15), porcelain, Vector3.ZERO, Vector3.ZERO, Vector3(0.95, 1.25, 0.85))
	for z in [-0.055, 0.055]:
		Parts.mesh(head, Parts.sphere(0.03, 8), Mats.std("void", Color(0, 0, 0), 1.0), Vector3(0.12, 0.04, z))
		Parts.eye(head, Vector3(0.135, 0.04, z), 0.008, Color(1.0, 0.9, 0.6), 6.0)
	# bouche : tampon rouge « CONTRÔLÉ »
	Parts.mesh(head, Parts.cyl(0.04, 0.04, 0.01, 12), Mats.std("stamp", Color(0.6, 0.02, 0.02), 0.6), Vector3(0.135, -0.09, 0), Vector3(0, 0, PI / 2))
	Parts.mesh(head, Parts.cyl(0.16, 0.16, 0.09, 16), coat, Vector3(-0.01, 0.2, 0))
	Parts.mesh(head, Parts.box(Vector3(0.14, 0.015, 0.22)), Mats.std("visor_black", Color(0.02, 0.02, 0.02), 0.15), Vector3(0.14, 0.16, 0), Vector3(0, 0, -0.2))
	Parts.mesh(head, Parts.box(Vector3(0.05, 0.04, 0.06)), Mats.std("brass", Color(0.7, 0.55, 0.2), 0.3, 1.0), Vector3(0.16, 0.22, 0))
	rig.mask = head


# ------------------------------------------------------------------ LA MANNEQUINE
func _build_mannequine() -> void:
	var plastic = Mats.skin("mannequine", {"base_color": Color(0.9, 0.88, 0.85), "dark_color": Color(0.6, 0.57, 0.55), "vein_color": Color(0.3, 0.25, 0.25),
		"wetness": 0.0, "veins": 0.15, "rim": 0.2, "plastic": 1.0, "scale": 2.0})
	var joint = Mats.std("mann_joint", Color(0.35, 0.33, 0.32), 0.3, 0.6)
	var root = Parts.pivot(self, Vector3.ZERO)
	rig.root = root
	var hips = Parts.pivot(root, Vector3(0, 0.98, 0))
	rig.hips = hips
	Parts.mesh(hips, Parts.sphere(0.17), plastic, Vector3.ZERO, Vector3.ZERO, Vector3(0.8, 0.7, 1.2))
	for side in [-1, 1]:
		var thigh = Parts.limb(hips, Vector3(0, -0.05, side * 0.11), 0.46, 0.07, plastic)
		Parts.mesh(thigh, Parts.sphere(0.06, 8), joint, Vector3(0, -0.46, 0))
		var shin = Parts.limb(thigh, Vector3(0, -0.46, 0), 0.44, 0.055, plastic)
		Parts.mesh(shin, Parts.box(Vector3(0.22, 0.06, 0.08)), plastic, Vector3(0.05, -0.46, 0))
		rig["thigh%d" % side] = thigh
		rig["shin%d" % side] = shin
	var torso = Parts.pivot(hips, Vector3(0, 0.05, 0))
	rig.torso = torso
	Parts.mesh(torso, Parts.capsule(0.17, 0.62), plastic, Vector3(0, 0.33, 0), Vector3.ZERO, Vector3(0.75, 1, 1.15))
	for side in [-1, 1]:
		Parts.mesh(torso, Parts.sphere(0.055, 8), joint, Vector3(0, 0.6, side * 0.24))
		var arm = Parts.limb(torso, Vector3(0, 0.6, side * 0.24), 0.32, 0.05, plastic)
		Parts.mesh(arm, Parts.sphere(0.045, 8), joint, Vector3(0, -0.32, 0))
		var fore = Parts.limb(arm, Vector3(0, -0.32, 0), 0.3, 0.045, plastic)
		Parts.mesh(fore, Parts.box(Vector3(0.05, 0.14, 0.03)), plastic, Vector3(0, -0.36, 0))
		rig["arm%d" % side] = arm
		rig["fore%d" % side] = fore
	var neck = Parts.pivot(torso, Vector3(0, 0.72, 0))
	rig.head = neck
	Parts.mesh(neck, Parts.cyl(0.04, 0.05, 0.12, 8), joint, Vector3(0, 0.05, 0))
	var head = Parts.pivot(neck, Vector3(0, 0.22, 0))
	Parts.mesh(head, Parts.sphere(0.12), plastic, Vector3.ZERO, Vector3.ZERO, Vector3(0.95, 1.3, 0.85))
	# visage lisse, deux creux d'orbites et un sourire peint trop fin
	for z in [-0.045, 0.045]:
		Parts.mesh(head, Parts.sphere(0.022, 8), Mats.std("mann_socket", Color(0.12, 0.1, 0.1), 0.9), Vector3(0.095, 0.03, z))
	Parts.mesh(head, Parts.box(Vector3(0.005, 0.006, 0.09)), Mats.std("mann_lips", Color(0.5, 0.03, 0.04), 0.4), Vector3(0.112, -0.07, 0), Vector3(0.0, 0, 0.0))
	rig.face = head


# ------------------------------------------------------------------ LE DÉMÉNAGEUR
func _build_demenageur() -> void:
	var flesh = _flesh("demenageur", Color(0.45, 0.33, 0.28), Color(0.15, 0.08, 0.06), 0.7, 0.5)
	var carton = Mats.skin("dem_carton", {"base_color": Color(0.5, 0.37, 0.22), "dark_color": Color(0.22, 0.14, 0.07), "vein_color": Color(0.3, 0.05, 0.05),
		"wetness": 0.3, "veins": 0.35, "rim": 0.1, "scale": 3.0})
	var tape = Mats.std("tape", Color(0.62, 0.52, 0.32), 0.25)
	var strap = Mats.std("strap_dem", Color(0.08, 0.08, 0.09), 0.7)
	var root = Parts.pivot(self, Vector3.ZERO)
	rig.root = root
	var hips = Parts.pivot(root, Vector3(0, 1.05, 0))
	rig.hips = hips
	for side in [-1, 1]:
		var thigh = Parts.limb(hips, Vector3(0, 0, side * 0.28), 0.55, 0.17, flesh)
		var shin = Parts.limb(thigh, Vector3(0, -0.52, 0), 0.5, 0.15, flesh)
		Parts.mesh(shin, Parts.box(Vector3(0.42, 0.14, 0.26)), strap, Vector3(0.06, -0.52, 0))
		rig["thigh%d" % side] = thigh
		rig["shin%d" % side] = shin
	var torso = Parts.pivot(hips, Vector3.ZERO)
	rig.torso = torso
	Parts.mesh(torso, Parts.capsule(0.48, 1.25), flesh, Vector3(0.05, 0.62, 0), Vector3.ZERO, Vector3(0.85, 1, 1.2))
	# sangles de déménagement
	for i in 3:
		Parts.mesh(torso, Parts.torus(0.43, 0.5, 20), strap, Vector3(0.05, 0.3 + i * 0.32, 0), Vector3(0, 0, 0.25 * (i - 1)), Vector3(0.88, 0.3, 1.2))
	for side in [-1, 1]:
		var arm = Parts.limb(torso, Vector3(0, 1.08, side * 0.62), 0.7, 0.16, flesh)
		var fore = Parts.limb(arm, Vector3(0, -0.66, 0), 0.75, 0.15, flesh)
		Parts.mesh(fore, Parts.sphere(0.2, 10), flesh, Vector3(0, -0.8, 0), Vector3.ZERO, Vector3(1.1, 0.9, 1))
		rig["arm%d" % side] = arm
		rig["fore%d" % side] = fore
	# tête : carton scotché, visage griffonné au marqueur, deux trous… et des yeux dedans
	var neck = Parts.pivot(torso, Vector3(0.12, 1.28, 0))
	rig.head = neck
	var head = Parts.pivot(neck, Vector3(0.05, 0.28, 0))
	Parts.mesh(head, Parts.box(Vector3(0.62, 0.56, 0.62)), carton, Vector3.ZERO, Vector3(0.05, 0.1, -0.06))
	Parts.mesh(head, Parts.box(Vector3(0.64, 0.08, 0.2)), tape, Vector3(0, 0.25, 0))
	for z in [-0.13, 0.13]:
		Parts.mesh(head, Parts.cyl(0.06, 0.06, 0.02, 10), Mats.std("void", Color(0, 0, 0), 1.0), Vector3(0.315, 0.06, z), Vector3(0, 0, PI / 2))
		Parts.eye(head, Vector3(0.3, 0.06, z), 0.022, Color(1.0, 0.35, 0.1), 5.0)
	Parts.mesh(head, Parts.box(Vector3(0.01, 0.04, 0.34)), Mats.std("marker", Color(0.02, 0.02, 0.02), 0.9), Vector3(0.315, -0.14, 0), Vector3(0.15, 0, 0))
	rig.face = head


# ------------------------------------------------------------------ LE BERGER
func _build_berger() -> void:
	var cloak = Mats.skin("berger_cloak", {"base_color": Color(0.2, 0.17, 0.14), "dark_color": Color(0.05, 0.04, 0.03), "vein_color": Color(0.1, 0.08, 0.05),
		"wetness": 0.1, "veins": 0.2, "rim": 0.1, "scale": 4.0})
	var bone = Mats.skin("berger_bone", {"base_color": Color(0.82, 0.77, 0.66), "dark_color": Color(0.4, 0.34, 0.25), "vein_color": Color(0.3, 0.2, 0.15),
		"wetness": 0.05, "veins": 0.4, "rim": 0.25, "scale": 3.5})
	var root = Parts.pivot(self, Vector3.ZERO)
	rig.root = root
	var hips = Parts.pivot(root, Vector3(0, 0.9, 0))
	rig.hips = hips
	for side in [-1, 1]:
		var leg = Parts.limb(hips, Vector3(0, 0, side * 0.14), 0.88, 0.06, bone)
		Parts.mesh(leg, Parts.cyl(0.03, 0.07, 0.12, 8), Mats.std("hoof", Color(0.05, 0.04, 0.03), 0.4), Vector3(0, -0.9, 0))
		rig["thigh%d" % side] = leg
	var torso = Parts.pivot(hips, Vector3.ZERO, Vector3(0, 0, -0.35))
	rig.torso = torso
	Parts.mesh(torso, Parts.cyl(0.22, 0.48, 1.4, 12), cloak, Vector3(0, 0.25, 0))
	# lambeaux qui pendent
	for i in 10:
		var a = i * TAU / 10.0
		Parts.mesh(torso, Parts.box(Vector3(0.1, 0.45, 0.02)), cloak, Vector3(cos(a) * 0.42, -0.5, sin(a) * 0.42), Vector3(0, -a, 0.15))
	for side in [-1, 1]:
		var arm = Parts.limb(torso, Vector3(0, 0.85, side * 0.25), 0.55, 0.045, bone)
		var fore = Parts.limb(arm, Vector3(0, -0.53, 0), 0.55, 0.04, bone)
		rig["arm%d" % side] = arm
		rig["fore%d" % side] = fore
	# houlette (main droite)
	var staff = Parts.pivot(rig.fore1, Vector3(0, -0.55, 0))
	rig.staff = staff
	Parts.mesh(staff, Parts.cyl(0.02, 0.025, 2.1, 8), Mats.std("staff", Color(0.3, 0.2, 0.12), 0.8), Vector3(0, 0.3, 0))
	Parts.mesh(staff, Parts.torus(0.1, 0.13, 16), Mats.std("staff", Color(0.3, 0.2, 0.12), 0.8), Vector3(0.1, 1.35, 0), Vector3(PI / 2, 0, 0))
	# crâne de bélier, cornes enroulées, orbites vides avec deux points rouges
	var neck = Parts.pivot(torso, Vector3(0.1, 0.98, 0))
	rig.head = neck
	var head = Parts.pivot(neck, Vector3(0.12, 0.15, 0), Vector3(0, 0, -0.5))
	Parts.mesh(head, Parts.sphere(0.13), bone, Vector3(0.1, 0, 0), Vector3.ZERO, Vector3(2.0, 0.95, 0.85))
	for side in [-1, 1]:
		Parts.mesh(head, Parts.torus(0.06, 0.13, 16), bone, Vector3(-0.02, 0.06, side * 0.14), Vector3(0, 0, 0), Vector3(1, 1, 0.5))
		Parts.mesh(head, Parts.sphere(0.035, 8), Mats.std("void", Color(0, 0, 0), 1.0), Vector3(0.12, 0.05, side * 0.07))
		Parts.eye(head, Vector3(0.135, 0.05, side * 0.07), 0.008, Color(1.0, 0.1, 0.05), 6.0)
	Parts.teeth(head, 7, 0.1, 0.03, Vector3(0.33, -0.08, 0), true, true)
	# cloche en laiton au cou — indice : elle tinte plus fort quand il sent un groupe
	var bell = Parts.pivot(neck, Vector3(0.05, -0.05, 0))
	rig.bell = bell
	Parts.mesh(bell, Parts.cyl(0.04, 0.09, 0.14, 12), Mats.std("bell", Color(0.75, 0.58, 0.22), 0.25, 1.0), Vector3(0, -0.1, 0))


# ------------------------------------------------------------------ L'ÉCHO
func _build_echo() -> void:
	var skin = _flesh("echo", Color(0.42, 0.42, 0.45), Color(0.1, 0.1, 0.12), 0.9, 0.9)
	var root = Parts.pivot(self, Vector3.ZERO)
	rig.root = root
	var body = Parts.pivot(root, Vector3(0, 0.55, 0))
	rig.torso = body
	Parts.mesh(body, Parts.capsule(0.26, 1.3), skin, Vector3(-0.1, 0, 0), Vector3(0, 0, PI / 2), Vector3(1, 1, 0.85))
	# vertèbres saillantes
	for i in 7:
		Parts.mesh(body, Parts.cyl(0.0, 0.05, 0.12, 6), Mats.std("spine", Color(0.75, 0.72, 0.65), 0.5), Vector3(-0.6 + i * 0.17, 0.25, 0))
	# six pattes grêles articulées
	var legs = []
	for i in 3:
		for side in [-1, 1]:
			var hip = Parts.pivot(body, Vector3(0.35 - i * 0.4, 0.0, side * 0.2), Vector3(side * 1.1, 0, 0))
			var up = Parts.limb(hip, Vector3.ZERO, 0.55, 0.035, skin)
			var low = Parts.limb(up, Vector3(0, -0.53, 0), 0.7, 0.025, skin)
			low.rotation.x = -side * 1.9
			legs.append({"hip": hip, "low": low, "side": side, "i": i})
	rig.legs = legs
	# tête : gueule-haut-parleur, grille sombre, couronne d'yeux minuscules
	var head = Parts.pivot(body, Vector3(0.62, 0.1, 0))
	rig.head = head
	Parts.mesh(head, Parts.sphere(0.24), skin, Vector3(0.05, 0, 0), Vector3.ZERO, Vector3(1.1, 0.95, 1.0))
	Parts.mesh(head, Parts.cyl(0.17, 0.17, 0.04, 20), Mats.std("speaker", Color(0.04, 0.04, 0.04), 0.5, 0.4), Vector3(0.27, -0.03, 0), Vector3(0, 0, PI / 2))
	for r in 3:
		Parts.mesh(head, Parts.torus(0.05 + r * 0.045, 0.06 + r * 0.045, 20), Mats.std("speaker_ring", Color(0.2, 0.2, 0.2), 0.3, 0.8), Vector3(0.29, -0.03, 0), Vector3(0, 0, PI / 2))
	Parts.teeth(head, 10, 0.32, 0.04, Vector3(0.28, 0.15, 0), true, true)
	Parts.teeth(head, 10, 0.32, 0.04, Vector3(0.28, -0.2, 0), false, true)
	for k in 7:
		var a = k * 0.5 - 1.5
		Parts.eye(head, Vector3(0.2, 0.2 + absf(a) * 0.02, a * 0.07), 0.015, Color(0.8, 1.0, 0.7), 5.0)


# ------------------------------------------------------------------ LE FAUX SAUVETEUR
func _build_sauveteur() -> void:
	var suit = Mats.skin("rescuer_suit", {"base_color": Color(0.95, 0.42, 0.08), "dark_color": Color(0.45, 0.15, 0.02), "vein_color": Color(0.4, 0.1, 0.05),
		"wetness": 0.15, "veins": 0.0, "rim": 0.15, "scale": 6.0})
	var flesh = _flesh("rescuer_flesh", Color(0.5, 0.15, 0.15), Color(0.12, 0.02, 0.02), 1.0, 0.95)
	var reflect = Mats.std("reflective", Color(0.85, 0.85, 0.8), 0.25, 0.0, 0.3)
	var root = Parts.pivot(self, Vector3.ZERO)
	rig.root = root
	var hips = Parts.pivot(root, Vector3(0, 0.95, 0))
	rig.hips = hips
	for side in [-1, 1]:
		var thigh = Parts.limb(hips, Vector3(0, 0, side * 0.12), 0.5, 0.09, suit)
		var shin = Parts.limb(thigh, Vector3(0, -0.48, 0), 0.46, 0.08, suit)
		Parts.mesh(shin, Parts.box(Vector3(0.28, 0.1, 0.14)), Mats.std("boot", Color(0.08, 0.07, 0.06), 0.8), Vector3(0.05, -0.46, 0))
		Parts.mesh(shin, Parts.torus(0.075, 0.09, 12), reflect, Vector3(0, -0.2, 0))
		rig["thigh%d" % side] = thigh
		rig["shin%d" % side] = shin
	var torso = Parts.pivot(hips, Vector3.ZERO)
	rig.torso = torso
	Parts.mesh(torso, Parts.capsule(0.22, 0.72), suit, Vector3(0, 0.35, 0), Vector3.ZERO, Vector3(0.85, 1, 1.12))
	Parts.mesh(torso, Parts.torus(0.2, 0.225, 16), reflect, Vector3(0, 0.3, 0), Vector3.ZERO, Vector3(0.88, 0.4, 1.12))
	Parts.mesh(torso, Parts.torus(0.2, 0.225, 16), reflect, Vector3(0, 0.5, 0), Vector3.ZERO, Vector3(0.88, 0.4, 1.12))
	for side in [-1, 1]:
		var arm = Parts.limb(torso, Vector3(0, 0.62, side * 0.27), 0.36, 0.075, suit)
		var fore = Parts.limb(arm, Vector3(0, -0.35, 0), 0.34, 0.065, suit)
		var claw = Parts.pivot(fore, Vector3(0, -0.36, 0))
		for f in 3:
			Parts.mesh(claw, Parts.cyl(0.004, 0.015, 0.25, 6), Mats.std("claw", Color(0.1, 0.08, 0.07), 0.3), Vector3(0.02, -0.1, (f - 1) * 0.03), Vector3(0, 0, 0.3))
		claw.visible = false
		rig["claw%d" % side] = claw
		rig["arm%d" % side] = arm
		rig["fore%d" % side] = fore
	# lanterne VERTE (indice : un vrai sauveteur aurait une lampe blanche)
	var lantern = Parts.pivot(rig["fore-1"], Vector3(0, -0.4, 0))
	Parts.mesh(lantern, Parts.cyl(0.06, 0.07, 0.2, 10), Mats.glow("green_lantern", Color(0.3, 1.0, 0.4), 2.5), Vector3(0, -0.1, 0))
	var l = OmniLight3D.new()
	l.light_color = Color(0.35, 1.0, 0.45)
	l.light_energy = 1.2
	l.omni_range = 5.0
	l.position = Vector3(0, -0.1, 0)
	lantern.add_child(l)
	lights.append(l)
	rig.lantern = lantern
	var neck = Parts.pivot(torso, Vector3(0, 0.75, 0))
	rig.head = neck
	# casque + visière fumée (déguisé)
	var mask = Parts.pivot(neck, Vector3.ZERO)
	rig.mask = mask
	Parts.mesh(mask, Parts.sphere(0.16), Mats.std("rescue_helmet", Color(0.95, 0.95, 0.92), 0.3), Vector3(0, 0.18, 0), Vector3.ZERO, Vector3(1.05, 0.9, 1.0))
	Parts.mesh(mask, Parts.sphere(0.13), Mats.std("visor", Color(0.04, 0.06, 0.08), 0.05, 0.8), Vector3(0.07, 0.15, 0), Vector3.ZERO, Vector3(0.75, 0.75, 1.0))
	# vraie tête : mâchoire verticale qui s'ouvre en deux (révélé)
	var true_head = Parts.pivot(neck, Vector3(0, 0.15, 0))
	rig.true_head = true_head
	for side in [-1, 1]:
		var half = Parts.pivot(true_head, Vector3(0.0, 0, side * 0.02))
		Parts.mesh(half, Parts.sphere(0.15), flesh, Vector3(0.04, 0.05, side * 0.06), Vector3.ZERO, Vector3(1.0, 1.4, 0.55))
		Parts.teeth(half, 8, 0.28, 0.04, Vector3(0.12, 0.05, side * 0.02), side > 0, false)
		rig["half%d" % side] = half
	Parts.eye(true_head, Vector3(0.05, 0.3, 0), 0.03, Color(1.0, 0.1, 0.05), 6.0)
	true_head.visible = false


# ------------------------------------------------------------------ LE DERNIER INVITÉ
func _build_invite() -> void:
	# forme déguisée : copie d'un coéquipier (construite à la demande)
	# vraie forme : silhouette noire étirée, sourire trop large
	var black = Mats.skin("invite_black", {"base_color": Color(0.06, 0.06, 0.07), "dark_color": Color(0.0, 0.0, 0.0), "vein_color": Color(0.2, 0.0, 0.02),
		"wetness": 0.9, "veins": 0.5, "rim": 0.6, "rim_color": Color(0.5, 0.5, 0.6), "scale": 2.0})
	true_form = Parts.pivot(self, Vector3.ZERO)
	rig.root = true_form
	var hips = Parts.pivot(true_form, Vector3(0, 1.3, 0))
	rig.hips = hips
	for side in [-1, 1]:
		var thigh = Parts.limb(hips, Vector3(0, 0, side * 0.1), 0.68, 0.05, black)
		var shin = Parts.limb(thigh, Vector3(0, -0.66, 0), 0.64, 0.04, black)
		rig["thigh%d" % side] = thigh
		rig["shin%d" % side] = shin
	var torso = Parts.pivot(hips, Vector3.ZERO)
	rig.torso = torso
	Parts.mesh(torso, Parts.capsule(0.13, 1.0), black, Vector3(0, 0.5, 0), Vector3.ZERO, Vector3(0.7, 1, 1))
	for side in [-1, 1]:
		var arm = Parts.limb(torso, Vector3(0, 0.92, side * 0.17), 0.75, 0.035, black)
		var fore = Parts.limb(arm, Vector3(0, -0.73, 0), 0.75, 0.03, black)
		rig["arm%d" % side] = arm
		rig["fore%d" % side] = fore
	var neck = Parts.pivot(torso, Vector3(0, 1.05, 0))
	rig.head = neck
	Parts.mesh(neck, Parts.sphere(0.14), black, Vector3(0, 0.18, 0), Vector3.ZERO, Vector3(0.9, 1.35, 0.85))
	for z in [-0.05, 0.05]:
		Parts.eye(neck, Vector3(0.12, 0.25, z), 0.012, Color(1, 1, 1), 5.0)
	var smile = Parts.mesh(neck, Parts.torus(0.085, 0.1, 24), Mats.glow("invite_smile", Color(0.95, 0.92, 0.85), 1.4), Vector3(0.09, 0.1, 0), Vector3(0, 0, PI / 2),
		Vector3(1.0, 0.3, 1.0))
	rig.smile = smile
	true_form.visible = false


func _ensure_disguise(as_id: String) -> void:
	if disguise_view != null and disguise_view.pid == as_id:
		return
	if disguise_view != null:
		disguise_view.queue_free()
	disguise_view = PlayerView.new()
	add_child(disguise_view)
	disguise_view.setup(as_id, players_cos.get(as_id, {}), false, false)
	disguise_view.wrong = true


# ================================================================== ANIMATION
func animate(s: Dictionary, dt: float, t: float) -> void:
	var st = String(s.s)
	var ex: Dictionary = s.get("ex", {})
	var moving = int(s.get("mv", 0)) == 1
	var resting = int(s.get("r", 0)) == 1
	var frozen = int(ex.get("frozen", 0)) == 1
	var speed = 0.0 if frozen else (1.0 if moving else 0.0)
	if st in ["chase", "charge", "lunge"]:
		speed *= 2.0
	phase += dt * speed * 6.0
	twitch_t -= dt
	var sw = sin(phase) * 0.5 * minf(1.0, speed)
	match type:
		"sourdine":
			_legs(sw)
			_arms(sw * 0.5, 0.15)
			rig.torso.rotation.z = -0.5 if st == "chase" else -0.2
			# cliquetis : la mâchoire claque à chaque « click »
			var c = int(ex.get("click", 0))
			if c != last.get("click", c):
				rig.jaw.scale = Vector3(1, 1.6, 1)
			rig.jaw.scale = rig.jaw.scale.lerp(Vector3.ONE, minf(1.0, dt * 12.0))
			last.click = c
			if st == "listen":
				rig.head.rotation.x = sin(t * 2.0) * 0.5
				rig.head.rotation.y = sin(t * 1.3) * 0.6
			else:
				rig.head.rotation = rig.head.rotation.lerp(Vector3.ZERO, minf(1.0, dt * 4.0))
			if resting:
				rig.torso.rotation.z = -0.9
		"inspecteur":
			_legs(sw * 0.6)
			_arms(sw * 0.3, 0.0)
			rig.lantern.rotation.z = sin(t * 2.2 + phase) * 0.25
			if st == "control" or st == "check":
				rig.arm1.rotation.z = 1.4
				rig.torso.rotation.z = -0.25 if st == "check" else 0.0
				rig.head.rotation.x = sin(t * 9.0) * 0.06
			else:
				rig.torso.rotation.z = 0.0
				rig.head.rotation.x = 0.0
			lights[0].light_energy = 1.1 + sin(t * 7.0) * 0.08
		"mannequine":
			# elle ne bouge que si personne ne regarde ; à chaque reprise, une nouvelle pose
			var cr = int(ex.get("creak", 0))
			if cr != last.get("creak", -1):
				last.creak = cr
				pose_seed += 1
				_random_pose()
			if not int(ex.get("watched", 0)) and moving:
				rig.root.position = Vector3(randf_range(-0.01, 0.01), 0, randf_range(-0.01, 0.01))
		"demenageur":
			var hunch = 0.0
			match st:
				"windup":
					hunch = -0.3
					rig.arm1.rotation.z = -0.6 + sin(t * 20.0) * 0.1
					rig["arm-1"].rotation.z = -0.6 + sin(t * 20.0 + 1.0) * 0.1
				"charge":
					hunch = -0.6
					rig.arm1.rotation.z = -0.9
					rig["arm-1"].rotation.z = -0.9
				"stunned", "chase":
					hunch = -0.15
					_arms(sw * 0.4, 0.2)
				_:
					_arms(sw * 0.4, 0.2)
			_legs(sw * 0.7)
			rig.torso.rotation.z = hunch
			if st == "stunned":
				rig.head.rotation.x = sin(t * 6.0) * 0.4
		"berger":
			_legs(sw * 0.5)
			_arms(sw * 0.2, 0.3)
			var bell = int(ex.get("bell", 0))
			rig.bell.rotation.z = sin(t * (4.0 + bell * 2.0)) * (0.15 + bell * 0.12)
			if st == "ring":
				rig.arm1.rotation.z = 2.6
				rig.head.rotation.z = sin(t * 18.0) * 0.1
			elif st == "stalk":
				rig.head.rotation.x = sin(t * 1.2) * 0.3
		"echo":
			for lg in rig.legs:
				var ph = phase * 1.5 + lg.i * 2.1 + (0.0 if lg.side > 0 else PI)
				lg.hip.rotation.y = sin(ph) * 0.35 * minf(1.0, speed)
				lg.hip.rotation.x = lg.side * (1.1 + maxf(0.0, cos(ph)) * 0.25 * minf(1.0, speed))
			rig.torso.position.y = 0.55 + sin(phase * 3.0) * 0.03
			rig.head.rotation.y = sin(t * 0.9) * (0.6 if st == "lurk" else 0.15)
			rig.head.rotation.x = sin(t * 2.3) * 0.15
		"sauveteur":
			var disguised = int(ex.get("disguised", 1)) == 1
			rig.mask.visible = disguised
			rig.true_head.visible = not disguised
			rig.lantern.visible = int(ex.get("lantern", 1)) == 1
			lights[0].visible = rig.lantern.visible
			rig.claw1.visible = not disguised
			rig["claw-1"].visible = not disguised
			_legs(sw)
			if disguised:
				_arms(sw * 0.4, 0.1)
				rig.arm1.rotation.z = 0.9 + sin(t * 1.5) * 0.15   # il fait signe de le suivre
				rig.torso.rotation.z = 0.0
				rig.torso.scale = Vector3.ONE
			else:
				var open = 0.5 + sin(t * 9.0) * 0.15
				rig.half1.rotation.x = open
				rig["half-1"].rotation.x = -open
				_arms(sw * 0.6, 0.5)
				rig.torso.rotation.z = -0.45
				rig.torso.scale = Vector3(1, 1.12, 1)
		"invite":
			var as_id = ex.get("as")
			if as_id != null and players_cos.has(as_id):
				_ensure_disguise(as_id)
				disguise_view.visible = true
				true_form.visible = false
				disguise_view.animate({"st": "alive", "sp": 2.5 if moving else 0.0, "m": "walk", "l": 0, "c": null}, dt, t)
			else:
				if disguise_view != null:
					disguise_view.visible = false
				true_form.visible = true
				_legs(sw * 1.2)
				_arms(sw * 0.8, 0.3)
				rig.torso.rotation.z = -0.3 if st == "flee" else 0.0
				rig.smile.scale = Vector3(1.0, 0.3 + absf(sin(t * 3.0)) * 0.15, 1.0 + absf(sin(t * 3.0)) * 0.1)
	# tics nerveux (tête qui se tord brusquement) : horreur garantie
	if twitch_t <= 0:
		twitch_t = randf_range(1.5, 5.0)
		if type in ["sourdine", "inspecteur", "berger", "invite", "sauveteur"] and rig.has("head"):
			rig.head.rotation.z += randf_range(-0.6, 0.6)
	elif rig.has("head") and type != "mannequine":
		rig.head.rotation.z = lerpf(rig.head.rotation.z, 0.0, minf(1.0, dt * 2.5))


func _legs(sw: float) -> void:
	if rig.has("thigh1"):
		rig.thigh1.rotation.z = sw
		rig["thigh-1"].rotation.z = -sw
	if rig.has("shin1"):
		rig.shin1.rotation.z = -maxf(0.0, sw) * 1.1
		rig["shin-1"].rotation.z = -maxf(0.0, -sw) * 1.1


func _arms(sw: float, fwd: float) -> void:
	if rig.has("arm1"):
		rig.arm1.rotation.z = -sw + fwd
		rig["arm-1"].rotation.z = sw + fwd
	if rig.has("fore1"):
		rig.fore1.rotation.z = 0.2
		rig["fore-1"].rotation.z = 0.2


func _random_pose() -> void:
	var r = RandomNumberGenerator.new()
	r.seed = hash(mid) + pose_seed * 7919
	rig.head.rotation = Vector3(r.randf_range(-0.5, 0.5), r.randf_range(-0.9, 0.9), r.randf_range(-1.1, 1.1))
	for k in ["arm1", "arm-1"]:
		rig[k].rotation = Vector3(r.randf_range(-0.8, 0.8), 0, r.randf_range(-0.4, 2.8))
	for k in ["fore1", "fore-1"]:
		rig[k].rotation = Vector3(0, 0, r.randf_range(0.0, 1.6))
	rig.torso.rotation = Vector3(r.randf_range(-0.3, 0.3), r.randf_range(-0.4, 0.4), r.randf_range(-0.5, 0.2))
	rig.thigh1.rotation.z = r.randf_range(-0.5, 0.5)
	rig["thigh-1"].rotation.z = r.randf_range(-0.5, 0.5)
