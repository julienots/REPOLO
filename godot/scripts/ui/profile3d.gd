# Profil local de la version 3D (fichier user://profile3d.json) : nom, crédits, expérience,
# cosmétiques possédés/portés, équipement, réglages. Rien n'est payant : tout se gagne
# en mission (même règle que la version web, aucun avantage achetable).
class_name Profile3D
extends RefCounted

const PATH = "user://profile3d.json"

static var data: Dictionary = {}


static func defaults() -> Dictionary:
	return {
		"name": "Employé", "coins": 0, "xp": 0, "cosmetics": Data.db.DEFAULT_COSMETICS.duplicate(), "equipment": "radio",
		"owned": {"suit": ["orange", "blue", "green", "red"], "mask": ["visor", "goggles"], "hat": ["none", "helmet"], "light": ["warm"]},
		"settings": {"sensitivity": 1.0, "volume": 0.8, "mic": false, "tts": true, "shadows": true, "scale": 1.0, "bots": 3},
		"stats": {"missions": 0, "wins": 0, "earned": 0, "revives": 0},
		"last": {"mission": "morvan", "difficulty": "employe"},
	}


static func load_profile() -> Dictionary:
	data = defaults()
	if FileAccess.file_exists(PATH):
		var f = FileAccess.open(PATH, FileAccess.READ)
		var parsed = JSON.parse_string(f.get_as_text())
		if parsed is Dictionary:
			_merge(data, parsed)
	return data


static func _merge(dst: Dictionary, src: Dictionary) -> void:
	for k in src:
		if dst.has(k) and dst[k] is Dictionary and src[k] is Dictionary and k != "owned":
			_merge(dst[k], src[k])
		else:
			dst[k] = src[k]


static func save() -> void:
	var f = FileAccess.open(PATH, FileAccess.WRITE)
	if f != null:
		f.store_string(JSON.stringify(data, " "))


static func xp_for_level(lvl: int) -> int:
	return int(round(250.0 * pow(lvl, 1.35)))


static func level_info() -> Dictionary:
	var xp = int(data.xp)
	var lvl = 1
	while xp >= xp_for_level(lvl):
		xp -= xp_for_level(lvl)
		lvl += 1
	return {"level": lvl, "into": xp, "next": xp_for_level(lvl)}


static func owns(slot: String, id: String) -> bool:
	return data.owned.get(slot, []).has(id)


# Un cosmétique est disponible s'il est gratuit et sans condition, ou acheté.
static func can_wear(slot: String, item: Dictionary) -> bool:
	if owns(slot, item.id):
		return true
	return int(item.get("price", 0)) == 0 and not item.has("achievement") and not item.has("level")


static func buy(slot: String, item: Dictionary) -> bool:
	if owns(slot, item.id):
		return true
	if item.has("achievement"):
		return false
	if item.has("level") and level_info().level < int(item.level):
		return false
	var price = int(item.get("price", 0))
	if int(data.coins) < price:
		return false
	data.coins = int(data.coins) - price
	if not data.owned.has(slot):
		data.owned[slot] = []
	data.owned[slot].append(item.id)
	save()
	return true


# Applique le résultat d'une mission : crédits, expérience, statistiques. Retourne le gain.
static func apply_result(result: Dictionary, my_id := "me") -> Dictionary:
	var mine = {}
	for p in result.get("players", []):
		if p.id == my_id:
			mine = p
	var coins = int(mine.get("coins", 0))
	var xp = int(mine.get("xp", 0))
	var before = level_info().level
	data.coins = int(data.coins) + coins
	data.xp = int(data.xp) + xp
	data.stats.missions = int(data.stats.missions) + 1
	if result.get("success", false):
		data.stats.wins = int(data.stats.wins) + 1
	data.stats.earned = int(data.stats.earned) + coins
	data.stats.revives = int(data.stats.revives) + int(mine.get("stats", {}).get("revives", 0))
	save()
	return {"coins": coins, "xp": xp, "level_up": level_info().level > before, "level": level_info().level}
