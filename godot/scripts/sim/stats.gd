# Statistiques, distinctions amusantes, morts absurdes, résultat de mission (port de stats.js).
class_name SimStats
extends RefCounted

const AWARDS = [
	{"id": "loudest", "name": "Mégaphone humain", "desc": "Le plus bruyant de l'équipe", "stat": "noise", "min": 60},
	{"id": "savior", "name": "Ange gardien", "desc": "Le plus de réanimations", "stat": "revives", "min": 1},
	{"id": "hoarder", "name": "Brocanteur distrait", "desc": "Plus grande valeur d'objets abandonnés", "stat": "abandonedValue", "min": 60},
	{"id": "runner", "name": "Marathonien de la peur", "desc": "Plus longue poursuite survécue", "stat": "longestChase", "min": 5},
	{"id": "disaster", "name": "Catastrophe ambulante", "desc": "Le plus d'objets cassés et d'alarmes", "stat": "catastrophes", "min": 2},
	{"id": "deserter", "name": "Chacun pour soi", "desc": "A « oublié » le plus de coéquipiers à terre", "stat": "abandons", "min": 1},
	{"id": "earner", "name": "Employé du mois", "desc": "A chargé le plus de butin", "stat": "deposited", "min": 100},
	{"id": "smuggler", "name": "Contrôle positif", "desc": "Objets confisqués par l'Inspecteur", "stat": "confiscated", "min": 1},
	{"id": "ghost", "name": "Fantôme bavard", "desc": "Le plus de « Bouh ! » post-mortem", "stat": "boos", "min": 3},
]

const MONSTER_DEATHS = {
	"sourdine": ["A parlé un peu trop fort près de la Sourdine", "Entendu à 30 mètres par une oreille géante"],
	"inspecteur": ["Refus d'obtempérer fatal", "Contrôlé, puis plus rien"],
	"mannequine": ["A quitté la Mannequine des yeux une seconde de trop", "Victime d'un mannequin de vitrine"],
	"demenageur": ["Déménagé de force", "Écrasé par un colosse en carton"],
	"berger": ["Isolé du troupeau", "S'est fait disperser"],
	"echo": ["Est allé voir « ce bruit, là-bas »", "Attiré par son propre écho"],
	"sauveteur": ["A fait confiance au sauveteur", "A suivi la lanterne verte"],
	"invite": ["A tourné le dos à un « collègue »", "Trahi par un sosie"],
}


static func compute_awards(players: Array) -> Array:
	var out = []
	for a in AWARDS:
		var best = null
		var bv = -INF
		for p in players:
			var v = float(p.stats[a.stat])
			if v > bv:
				bv = v
				best = p
		if best != null and bv >= a.min:
			out.append({"id": a.id, "name": a.name, "desc": a.desc, "player": best.id, "playerName": best.name, "value": str(int(round(bv)))})
	for p in players:
		if p.stats.absurd and p.stats.deathCause != "":
			out.append({"id": "absurd", "name": "Mort la plus absurde", "desc": p.stats.deathCause, "player": p.id, "playerName": p.name, "value": ""})
			break
	for p in players:
		if p.stats.lastSecond:
			out.append({"id": "last_second", "name": "In extremis", "desc": "Sauvetage ou fuite à la dernière seconde", "player": p.id, "playerName": p.name, "value": ""})
	return out


static func death_cause(g, p, cause: String) -> Dictionary:
	var ctx = p.last_hit
	var carried_value = float(ctx.get("carriedValue", -1.0))
	if carried_value >= 0 and carried_value < 10 and ctx.get("carriedName", "") != "":
		return {"text": "Mort en protégeant un « %s » sans valeur" % ctx.carriedName, "absurd": true}
	if g.mods.confetti:
		return {"text": "Mort sous une pluie de confettis", "absurd": true}
	if g.mods.monsterFreeze:
		return {"text": "Tué pendant la pause café des monstres (?!)", "absurd": true}
	if cause == "left":
		return {"text": "Oublié par le fourgon", "absurd": true}
	if cause == "bleed":
		var near = 0
		for o in g.players.values():
			if o != p and o.state == "alive" and Vector2(o.x - p.x, o.y - p.y).length() < 8:
				near += 1
		if near > 0:
			return {"text": "Ignoré par %d collègue(s) pourtant tout proche(s)" % near, "absurd": true}
		return {"text": "Seul, à terre, dans le noir", "absurd": false}
	var mt = ctx.get("monsterType", "")
	if mt == "mannequine" and not p.light:
		return {"text": "A éteint sa lampe face à la Mannequine", "absurd": true}
	if mt == "demenageur" and g.flags.has("bonk"):
		return {"text": "Écrasé par un Déménageur encore sonné", "absurd": true}
	if MONSTER_DEATHS.has(mt):
		return {"text": g.rng.pick(MONSTER_DEATHS[mt]), "absurd": false}
	return {"text": "Cause inconnue (dossier classé)", "absurd": false}


static func build_result(g) -> Dictionary:
	var m = g.mission
	var players = g.players.values()
	var awards = compute_awards(players)
	var side_done = []
	var side_bonus = 0.0
	for o in g.side_objectives:
		if g.check_side(o):
			side_done.append(o.id)
			side_bonus += float(o.reward)
	var total = m.deposited + m.bonus
	var humans = players.filter(func(p): return not p.is_bot)
	var share = (total * 0.3 * float(g.diff.rewardMul)) / maxf(1.0, sqrt(humans.size()))
	var monsters_seen = []
	for mo in g.monsters:
		if not monsters_seen.has(mo.type):
			monsters_seen.append(mo.type)
	var side = []
	for o in g.side_objectives:
		side.append({"id": o.id, "name": o.name, "reward": o.reward, "done": side_done.has(o.id)})
	var pres = []
	for p in players:
		var survived = p.state == "extracted"
		var base = share * (1.0 if survived else 0.4) if m.success else share * 0.15
		var my_awards = []
		for a in awards:
			if a.player == p.id:
				my_awards.append(a.id)
		var coins = int(round(base + (60 + side_bonus / maxf(1.0, humans.size()) if m.success else 15) + my_awards.size() * 25 + p.stats.revives * 30))
		var xp = int(round(80 + p.stats.deposited * 0.25 + (70 if survived else 0) + (120 if m.success else 0) + p.stats.revives * 40))
		pres.append({"id": p.id, "name": p.name, "bot": p.is_bot, "botProfile": p.bot_profile, "cosmetics": p.cosmetics, "survived": survived, "state": p.state,
			"stats": p.stats.duplicate(), "awards": my_awards, "coins": coins, "xp": xp})
	var extracted_types = []
	for e in g.extracted:
		extracted_types.append(e.type)
	return {
		"success": m.success, "reason": m.endReason, "quota": m.quota, "deposited": round(m.deposited), "bonus": round(m.bonus + side_bonus),
		"mission": g.mission_id, "missionName": g.mission_def.name, "difficulty": g.diff_id, "variant": g.variant.name, "seed": g.seed_value,
		"time": int(g.time), "timeLeft": int(m.timeLeft), "eventsSeen": g.director.history.duplicate(), "monstersSeen": monsters_seen,
		"extractedTypes": extracted_types, "flags": g.flags.keys(), "side": side, "awards": awards, "highlights": g.highlights, "players": pres,
	}
