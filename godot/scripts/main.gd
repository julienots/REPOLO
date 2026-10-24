# Point d'entrée (version provisoire pour valider la chaîne de compilation).
extends Node


func _ready() -> void:
	var m = MapGen.generate("warehouse", 1234)
	print("Carte générée : %dx%d, %d objets" % [m.w, m.h, m.items.size()])
