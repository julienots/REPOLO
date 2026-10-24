# Autoload « Data » : données du jeu partagées avec la version web (godot/data/game_data.json,
# généré par scripts/export-godot-data.mjs depuis shared/data).
extends Node

var db: Dictionary = {}


func _init() -> void:
	var f = FileAccess.open("res://data/game_data.json", FileAccess.READ)
	if f == null:
		push_error("Données introuvables : res://data/game_data.json")
		return
	var parsed = JSON.parse_string(f.get_as_text())
	if parsed is Dictionary:
		db = parsed
	else:
		push_error("Données invalides")


func sim(key: String) -> float:
	return float(db.SIM[key])
