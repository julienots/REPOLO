# Petites briques pour assembler les modèles procéduraux (personnages, créatures, objets) :
# chaque modèle est fait de primitives (capsules, sphères, cônes, tores) montées sur des
# pivots que les vues animent (marche, respiration, tics).
class_name Parts
extends RefCounted


static func pivot(parent: Node3D, pos: Vector3, rot := Vector3.ZERO) -> Node3D:
	var n = Node3D.new()
	n.position = pos
	n.rotation = rot
	parent.add_child(n)
	return n


static func mesh(parent: Node3D, m: Mesh, mat: Material, pos := Vector3.ZERO, rot := Vector3.ZERO, scl := Vector3.ONE) -> MeshInstance3D:
	var mi = MeshInstance3D.new()
	mi.mesh = m
	mi.material_override = mat
	mi.position = pos
	mi.rotation = rot
	mi.scale = scl
	parent.add_child(mi)
	return mi


static func capsule(r: float, h: float) -> CapsuleMesh:
	var c = CapsuleMesh.new()
	c.radius = r
	c.height = maxf(h, r * 2.0 + 0.001)
	c.radial_segments = 16
	c.rings = 6
	return c


static func sphere(r: float, segs := 16) -> SphereMesh:
	var s = SphereMesh.new()
	s.radius = r
	s.height = r * 2.0
	s.radial_segments = segs
	s.rings = int(segs / 2.0)
	return s


static func cyl(top: float, bottom: float, h: float, segs := 16) -> CylinderMesh:
	var c = CylinderMesh.new()
	c.top_radius = top
	c.bottom_radius = bottom
	c.height = h
	c.radial_segments = segs
	c.rings = 1
	return c


static func box(size: Vector3) -> BoxMesh:
	var b = BoxMesh.new()
	b.size = size
	return b


static func torus(inner: float, outer: float, segs := 16) -> TorusMesh:
	var t = TorusMesh.new()
	t.inner_radius = inner
	t.outer_radius = outer
	t.rings = segs
	t.ring_segments = 8
	return t


static func prism(size: Vector3) -> PrismMesh:
	var p = PrismMesh.new()
	p.size = size
	return p


# Membre « suspendu » : un pivot à l'articulation, le segment pend vers le bas (-Y).
static func limb(parent: Node3D, at: Vector3, length: float, radius: float, mat: Material) -> Node3D:
	var p = pivot(parent, at)
	mesh(p, capsule(radius, length), mat, Vector3(0, -length / 2.0, 0))
	return p


# Rangée de dents (petits prismes) le long de X ou de Z.
static func teeth(parent: Node3D, count: int, width: float, size: float, pos: Vector3, down := true, along_z := true) -> void:
	var mat = Mats.std("teeth", Color(0.82, 0.78, 0.62), 0.3)
	for i in count:
		var t = float(i) / maxf(1, count - 1) - 0.5
		var off = Vector3(0, 0, t * width) if along_z else Vector3(t * width, 0, 0)
		var s = size * (0.7 + 0.6 * absf(sin(i * 2.7)))
		mesh(parent, prism(Vector3(s * 0.6, s, s * 0.5)), mat, pos + off, Vector3(PI if down else 0.0, 0, 0))


static func eye(parent: Node3D, pos: Vector3, r: float, col: Color, energy := 4.0) -> MeshInstance3D:
	return mesh(parent, sphere(r, 8), Mats.glow("eye_%s_%.1f" % [col.to_html(false), energy], col, energy), pos)
