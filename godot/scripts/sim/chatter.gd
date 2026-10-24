# Dialogues des bots : contexte, personnalité, anti-répétition (port de bots/chatter.js).
class_name SimChatter
extends RefCounted

const DIRS = ["à gauche", "à droite", "en haut", "en bas", "derrière toi", "tout droit", "vers la lumière"]

var game
var recent = []


func _init(g) -> void:
	game = g


func say(bot, trigger: String, ctx := {}, opts := {}) -> bool:
	var g = game
	var prof = bot.profile
	if prof.is_empty():
		return false
	if not opts.get("force", false):
		if bot.brain != null and bot.brain.talk_cd > g.time:
			return false
		if not g.rng.chance(minf(1.0, float(opts.get("chance", 0.8)) * float(prof.talk))):
			return false
	var lines = Data.db.LINES
	if not lines.has(trigger):
		return false
	var pool = lines[trigger]
	var own = pool.get(bot.bot_profile, [])
	var candidates = []
	for l in own + own + pool.get("all", []):
		if not recent.has(l):
			candidates.append(l)
	if candidates.is_empty():
		return false
	var tpl = g.rng.pick(candidates)
	var line = String(tpl).replace("{item}", ctx.get("item", "truc")).replace("{monster}", ctx.get("monster", "UN MONSTRE")) \
		.replace("{name}", ctx.get("name", "quelqu'un")).replace("{value}", str(ctx.get("value", "???"))).replace("{dir}", ctx.get("dir", g.rng.pick(DIRS)))
	recent.append(tpl)
	if recent.size() > 40:
		recent.pop_front()
	if bot.brain != null:
		bot.brain.talk_cd = g.time + g.rng.range_f(5, 11) / maxf(0.4, float(prof.talk))
	var loud = "scream" if trigger == "spot_monster" and float(prof.panic) > 0.7 else "talk"
	g.bot_speak(bot, line, loud)
	return true
