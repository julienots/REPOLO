# Entités de la simulation (port de shared/sim) : joueur, objet, bruit.
class_name SimEntities
extends RefCounted


class SimPlayer:
	extends RefCounted
	var id: String
	var name: String
	var is_bot = false
	var bot_profile = ""
	var profile: Dictionary = {}
	var cosmetics: Dictionary = {}
	var equipment = "radio"
	var charges = 0
	var x = 0.0
	var y = 0.0
	var px = 0.0
	var py = 0.0
	var vx = 0.0
	var vy = 0.0
	var angle = -PI / 2.0
	var speed = 0.0
	var move_mode = "walk"
	var state = "alive"          # alive | downed | dead | extracted
	var hp = 3
	var down_t = 0.0
	var carry = ""               # id de l'objet porté
	var light = true
	var battery = 1.0
	var radio_battery = 1.0
	var stamina = 1.0
	var hidden = 0               # id du casier (0 = visible)
	var voice_level = 0.0
	var voice_t = -10.0
	var voice_acc = 0.0
	var radio_tx = false
	var tp = 0
	var kb = [0, 0.0, 0.0]
	var invuln_t = 0.0
	var hurt_t = 0.0
	var flicker_t = 0.0
	var step_acc = 0.0
	var holding = false
	var channel: Dictionary = {}  # {kind, target, t}
	var elevator_cd = 0.0
	var emote = ""
	var emote_until = 0.0
	var boo_cd = 0.0
	var last_hit: Dictionary = {}
	var connected = true
	var bot_control = false
	var brain = null
	var stats: Dictionary = {}
	var downed_near: Array = []
	var was_in_van = false
	var entered_van_t = -100.0

	func _init(info: Dictionary) -> void:
		id = info.id
		name = info.get("name", "Employé")
		is_bot = info.get("isBot", false)
		bot_profile = info.get("botProfile", "")
		cosmetics = info.get("cosmetics", {})
		equipment = info.get("equipment", "radio")
		bot_control = is_bot
		stats = SimEntities.new_stats()


class SimItem:
	extends RefCounted
	var id: String
	var type: String
	var def: Dictionary
	var x = 0.0
	var y = 0.0
	var vx = 0.0
	var vy = 0.0
	var base_value = 0.0
	var value = 0.0
	var carried_by = ""
	var helper = ""
	var fall_t = 0.0
	var last_touch = ""
	var last_dropped_by = ""
	var in_van_t = 0.0
	var claimed_by = ""
	var secret = false
	var squeak_t = 0.0
	var decoy_t = -1.0
	var decoy_pulses = 0
	var decoy_pulse_t = 0.0
	var flare_t = -1.0
	var flare_noise_t = 0.0
	var is_flare = false
	var thrown_by = ""
	var thrown_t = -10.0

	func radius() -> float:
		return float(def.radius)

	func weight() -> int:
		return int(def.weight)


static func new_stats() -> Dictionary:
	return {
		"noise": 0.0, "revives": 0, "deposited": 0.0, "depositedCount": 0, "abandonedValue": 0.0, "longestChase": 0.0, "chaseT": 0.0,
		"catastrophes": 0, "broken": 0.0, "abandons": 0, "deaths": 0, "lastSecond": false, "confiscated": 0, "boos": 0,
		"fragileIntact": 0, "heavyExtracted": 0, "deathCause": "", "absurd": false, "hits": 0,
	}
