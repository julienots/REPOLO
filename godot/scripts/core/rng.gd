# Générateur pseudo-aléatoire déterministe (mulberry32), identique à shared/util/rng.js :
# même graine = même carte que la version web / le serveur.
class_name Rng
extends RefCounted

const MASK := 0xFFFFFFFF
var s: int = 0

func _init(seed_value: int = 0) -> void:
	s = seed_value & MASK
	if s == 0:
		s = 0x9e3779b9

static func imul(a: int, b: int) -> int:
	return ((a & MASK) * (b & MASK)) & MASK

func next() -> float:
	s = (s + 0x6d2b79f5) & MASK
	var t: int = s
	t = imul(t ^ (t >> 15), t | 1)
	t = (t ^ ((t + imul(t ^ (t >> 7), t | 61)) & MASK)) & MASK
	return float((t ^ (t >> 14)) & MASK) / 4294967296.0

func range_f(a: float, b: float) -> float:
	return a + (b - a) * next()

# bornes incluses (comme rng.int en JS)
func int_range(a: int, b: int) -> int:
	return int(floor(a + (b - a + 1) * next()))

func chance(p: float) -> bool:
	return next() < p

func pick(arr: Array):
	return arr[int(floor(next() * arr.size()))]

func shuffle(arr: Array) -> Array:
	for i in range(arr.size() - 1, 0, -1):
		var j = int(floor(next() * (i + 1)))
		var tmp = arr[i]
		arr[i] = arr[j]
		arr[j] = tmp
	return arr

# weights : poids (même ordre que entries). Retourne null si total nul.
func weighted(entries: Array, weights: Array):
	var total = 0.0
	for w in weights:
		total += max(0.0, float(w))
	if total <= 0.0:
		return null
	var r = next() * total
	for i in entries.size():
		r -= max(0.0, float(weights[i]))
		if r <= 0.0:
			return entries[i]
	return entries[entries.size() - 1]

static func hash_string(text: String) -> int:
	var h: int = 2166136261
	var buf = text.to_utf16_buffer()
	for i in range(0, buf.size(), 2):
		var code: int = buf[i] | (buf[i + 1] << 8)
		h = (h ^ code) & MASK
		h = imul(h, 16777619)
	return h
