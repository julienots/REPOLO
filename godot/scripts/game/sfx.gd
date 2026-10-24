# Sons du jeu 3D, synthétisés au lancement (aucun fichier audio téléchargé) avec les mêmes
# recettes que la version web : oscillateurs, bruit filtré, enveloppes. Les sons sont
# joués en 3D (atténuation, effet de distance) aux positions des bruits de la simulation.
class_name Sfx
extends Node

const RATE = 22050

var bank = {}
var pool = []
var pool_i = 0
var ui_player: AudioStreamPlayer
var ambience: AudioStreamPlayer
var heart: AudioStreamPlayer
var heart_t = 0.0
var creak_t = 6.0
var master_db = 0.0
var rng = RandomNumberGenerator.new()


func _ready() -> void:
	rng.randomize()
	for i in 20:
		var p = AudioStreamPlayer3D.new()
		p.unit_size = 4.0
		p.max_distance = 40.0
		p.attenuation_model = AudioStreamPlayer3D.ATTENUATION_INVERSE_DISTANCE
		p.attenuation_filter_cutoff_hz = 3000.0
		p.attenuation_filter_db = -18.0
		p.bus = "Master"
		add_child(p)
		pool.append(p)
	ui_player = AudioStreamPlayer.new()
	add_child(ui_player)
	ambience = AudioStreamPlayer.new()
	ambience.volume_db = -14.0
	add_child(ambience)
	heart = AudioStreamPlayer.new()
	heart.volume_db = -6.0
	add_child(heart)


# ------------------------------------------------------------------ SYNTHÈSE
class Buf:
	var data: PackedFloat32Array
	var rng = RandomNumberGenerator.new()

	func _init(dur: float) -> void:
		data = PackedFloat32Array()
		data.resize(int(dur * RATE) + 1)
		rng.seed = 4242

	# oscillateur avec glissando exponentiel f0 → f1 et enveloppe attaque/décroissance exponentielle
	func osc(kind: String, f0: float, f1: float, t0: float, dur: float, vol: float, attack := 0.005) -> void:
		var n0 = int(t0 * RATE)
		var n = int(dur * RATE)
		var ph = 0.0
		var glide = f1 > 0 and f1 != f0
		for i in n:
			var k = n0 + i
			if k >= data.size():
				break
			var u = float(i) / n
			var f = f0 * pow(f1 / f0, u) if glide else f0
			ph = fmod(ph + f / RATE, 1.0)
			var s = 0.0
			match kind:
				"sine":
					s = sin(ph * TAU)
				"square":
					s = 1.0 if ph < 0.5 else -1.0
				"sawtooth":
					s = ph * 2.0 - 1.0
				_:
					s = 4.0 * absf(ph - 0.5) - 1.0
			var tt = float(i) / RATE
			var env = minf(1.0, tt / maxf(attack, 0.0005)) * exp(-5.0 * u)
			data[k] += s * vol * env

	# bruit blanc filtré (biquad RBJ) : lowpass / highpass / bandpass ; glissement de fréquence optionnel
	func noise(t0: float, dur: float, vol: float, ftype := "bandpass", freq := 1000.0, q := 1.0, attack := 0.003, freq_end := -1.0) -> void:
		var n0 = int(t0 * RATE)
		var n = int(dur * RATE)
		var x1 = 0.0
		var x2 = 0.0
		var y1 = 0.0
		var y2 = 0.0
		for i in n:
			var k = n0 + i
			if k >= data.size():
				break
			var u = float(i) / n
			var f = freq if freq_end < 0 else lerpf(freq, freq_end, u)
			var w0 = TAU * clampf(f, 20.0, RATE * 0.45) / RATE
			var alpha = sin(w0) / (2.0 * q)
			var cw = cos(w0)
			var b0
			var b1
			var b2
			match ftype:
				"lowpass":
					b0 = (1.0 - cw) / 2.0
					b1 = 1.0 - cw
					b2 = b0
				"highpass":
					b0 = (1.0 + cw) / 2.0
					b1 = -(1.0 + cw)
					b2 = b0
				_:
					b0 = alpha
					b1 = 0.0
					b2 = -alpha
			var a0 = 1.0 + alpha
			var a1 = -2.0 * cw
			var a2 = 1.0 - alpha
			var x = rng.randf_range(-1.0, 1.0)
			var y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0
			x2 = x1
			x1 = x
			y2 = y1
			y1 = y
			var tt = float(i) / RATE
			var env = minf(1.0, tt / maxf(attack, 0.0005)) * exp(-5.0 * u)
			data[k] += y * vol * env * (2.0 if ftype == "bandpass" else 1.0)

	func to_wav(loop := false) -> AudioStreamWAV:
		var peak = 0.0
		for v in data:
			peak = maxf(peak, absf(v))
		var g = 0.9 / peak if peak > 0.9 else 1.0
		var bytes = PackedByteArray()
		bytes.resize(data.size() * 2)
		for i in data.size():
			bytes.encode_s16(i * 2, int(clampf(data[i] * g, -1.0, 1.0) * 32767.0))
		var w = AudioStreamWAV.new()
		w.format = AudioStreamWAV.FORMAT_16_BITS
		w.mix_rate = RATE
		w.stereo = false
		w.data = bytes
		if loop:
			w.loop_mode = AudioStreamWAV.LOOP_FORWARD
			w.loop_end = data.size() - 1
		return w


func get_sound(sname: String) -> AudioStreamWAV:
	if bank.has(sname):
		return bank[sname]
	var b: Buf
	match sname:
		"step":
			b = Buf.new(0.2)
			b.noise(0, 0.12, 0.5, "lowpass", 300, 1)
			b.osc("sine", 90, 50, 0, 0.1, 0.4)
		"step_debris":
			b = Buf.new(0.3)
			for i in 6:
				b.noise(i * 0.03, 0.05, 0.4, "highpass", 5000, 1)
			b.noise(0, 0.12, 0.3, "lowpass", 400, 1)
		"step_grate":
			b = Buf.new(0.35)
			b.osc("square", 420, 380, 0, 0.18, 0.25)
			b.osc("square", 653, 610, 0.01, 0.15, 0.15)
			b.noise(0, 0.1, 0.3, "bandpass", 2500, 3)
		"door":
			b = Buf.new(0.9)
			b.noise(0, 0.8, 0.5, "bandpass", 500, 12, 0.08, 900)
			b.osc("sine", 70, 60, 0.6, 0.2, 0.4)
		"door_smash", "smash":
			b = Buf.new(1.0)
			b.osc("sine", 60, 30, 0, 0.5, 1.0, 0.002)
			b.noise(0, 0.6, 0.8, "lowpass", 900, 1)
			for i in 6:
				b.noise(0.05 + i * 0.07, 0.15, 0.25, "highpass", 3000, 1)
		"impact":
			b = Buf.new(0.4)
			b.osc("sine", 140, 60, 0, 0.25, 0.6, 0.002)
			b.noise(0, 0.2, 0.5, "lowpass", 1200, 1)
		"break":
			b = Buf.new(0.9)
			for i in 9:
				b.noise(i * 0.04, 0.25, 0.35, "highpass", 4000 + i * 300, 2)
			b.osc("triangle", 3000, 1500, 0, 0.3, 0.15)
		"kaching":
			b = Buf.new(0.8)
			b.osc("triangle", 1318, 1318, 0, 0.4, 0.4)
			b.osc("triangle", 1760, 1760, 0.08, 0.6, 0.4)
			b.noise(0, 0.1, 0.2, "highpass", 6000, 1)
		"voice":
			b = Buf.new(0.8)
			for i in 6:
				var f = 180 + rng.randf() * 120
				b.osc("sawtooth", f, f * (0.8 + rng.randf() * 0.4), i * 0.11, 0.1, 0.08)
				b.noise(i * 0.11, 0.08, 0.06, "bandpass", 1200 + rng.randf() * 800, 4)
		"mimic":
			b = Buf.new(0.9)
			for i in 6:
				var f = (180 + rng.randf() * 120) * 1.35
				b.osc("sawtooth", f, f * (0.7 + rng.randf() * 0.4), i * 0.11, 0.1, 0.08)
				b.noise(i * 0.11, 0.08, 0.06, "bandpass", 1500 + rng.randf() * 800, 4)
			b.noise(0, 0.8, 0.12, "highpass", 5000, 0.5)
		"scream":
			b = Buf.new(1.0)
			b.osc("sawtooth", 600, 900, 0, 0.8, 0.35, 0.03)
			b.osc("sawtooth", 612, 870, 0, 0.8, 0.25, 0.03)
			b.noise(0, 0.7, 0.2, "bandpass", 2000, 2)
		"squeak":
			b = Buf.new(0.3)
			b.osc("sine", 1400, 2200, 0, 0.2, 0.4)
		"radio":
			b = Buf.new(0.5)
			b.noise(0, 0.45, 0.4, "bandpass", 2500, 1.5)
			b.osc("square", 1000, 1000, 0, 0.05, 0.08)
		"locker":
			b = Buf.new(0.5)
			b.osc("square", 220, 180, 0, 0.2, 0.2)
			b.noise(0, 0.3, 0.4, "bandpass", 800, 4)
		"elevator", "ding":
			b = Buf.new(1.4)
			b.osc("sine", 880, 880, 0, 1.2, 0.3)
			b.osc("sine", 1318, 1318, 0.25, 1.0, 0.25)
			b.noise(0, 1.2, 0.08, "lowpass", 200, 1, 0.3)
		"monster":
			b = Buf.new(1.0)
			b.osc("sawtooth", 80, 55, 0, 0.8, 0.35, 0.05)
			b.osc("sawtooth", 83, 52, 0, 0.8, 0.3, 0.05)
			b.noise(0, 0.7, 0.25, "lowpass", 400, 1, 0.05)
		"roar":
			b = Buf.new(1.2)
			b.osc("sawtooth", 90, 60, 0, 1.0, 0.5, 0.08)
			b.osc("sawtooth", 93, 58, 0, 1.0, 0.4, 0.08)
			b.noise(0, 1.0, 0.3, "lowpass", 500, 1, 0.08)
		"whistle":
			b = Buf.new(1.0)
			b.osc("sine", 2800, 2800, 0, 0.25, 0.3)
			b.osc("sine", 2800, 2700, 0.32, 0.5, 0.3)
		"shriek":
			b = Buf.new(0.6)
			b.osc("sawtooth", 700, 1600, 0, 0.45, 0.35)
			b.osc("sawtooth", 710, 1500, 0.05, 0.45, 0.25)
		"reveal":
			b = Buf.new(0.7)
			b.osc("sawtooth", 300, 900, 0, 0.5, 0.4)
			b.osc("square", 310, 880, 0, 0.5, 0.2)
			b.noise(0, 0.5, 0.3, "highpass", 2000, 1)
		"bonk":
			b = Buf.new(1.2)
			b.osc("sine", 70, 35, 0, 0.9, 1.0, 0.002)
			b.osc("triangle", 1200, 600, 0.05, 0.6, 0.12)
			b.noise(0, 0.5, 0.6, "lowpass", 700, 1)
		"wall_break", "wallbreak":
			b = Buf.new(2.0)
			b.osc("sine", 50, 25, 0, 1.8, 0.9, 0.01)
			b.noise(0, 1.8, 0.7, "lowpass", 600, 1, 0.02)
		"boo":
			b = Buf.new(1.0)
			b.osc("sine", 300, 180, 0, 0.9, 0.3, 0.1)
			b.osc("sine", 303, 178, 0, 0.9, 0.2, 0.1)
		"decoy":
			b = Buf.new(0.4)
			b.osc("square", 1600, 1600, 0, 0.12, 0.25)
			b.osc("square", 1200, 1200, 0.15, 0.12, 0.25)
		"hit":
			b = Buf.new(0.6)
			b.osc("sine", 120, 40, 0, 0.4, 0.9, 0.002)
			b.noise(0, 0.3, 0.6, "lowpass", 1500, 1)
		"stamp":
			b = Buf.new(0.4)
			b.osc("sine", 160, 80, 0, 0.15, 0.7, 0.001)
			b.noise(0, 0.08, 0.6, "lowpass", 2000, 1)
		"heal":
			b = Buf.new(0.8)
			for i in 3:
				b.osc("triangle", 660 * pow(1.25, i), 0, i * 0.1, 0.4, 0.2)
		"click":
			b = Buf.new(0.15)
			b.osc("square", 2600, 1800, 0, 0.02, 0.3)
			b.osc("square", 2400, 1700, 0.06, 0.02, 0.25)
		"creak":
			b = Buf.new(0.45)
			b.noise(0, 0.35, 0.5, "bandpass", 900, 12, 0.02, 1500)
		"stomp":
			b = Buf.new(0.4)
			b.osc("sine", 55, 30, 0, 0.3, 1.0, 0.01)
			b.noise(0, 0.2, 0.3, "lowpass", 180, 1)
		"bell":
			b = Buf.new(1.4)
			b.osc("sine", 1046, 0, 0, 1.2, 0.3)
			b.osc("sine", 2113, 0, 0, 0.8, 0.12)
			b.osc("sine", 3140, 0, 0, 0.4, 0.06)
		"skitter":
			b = Buf.new(0.4)
			for i in 8:
				b.noise(i * 0.035, 0.02, 0.3, "highpass", 4000, 1)
		"keys":
			b = Buf.new(0.5)
			for i in 4:
				b.osc("triangle", 3200 + rng.randf() * 1500, 0, i * 0.07 + rng.randf() * 0.03, 0.08, 0.1)
		"stinger":
			b = Buf.new(1.6)
			b.osc("sawtooth", 110, 104, 0, 1.4, 0.25, 0.05)
			b.osc("sawtooth", 117, 111, 0, 1.4, 0.2, 0.05)
			b.osc("square", 233, 220, 0, 1.2, 0.08, 0.3)
			b.noise(0, 0.3, 0.5, "highpass", 3000, 0.5)
		"amb_creak":
			b = Buf.new(1.3)
			b.noise(0, 1.1, 0.25, "bandpass", 400, 14, 0.2, 250)
		"drip":
			b = Buf.new(0.2)
			b.osc("sine", 1800, 900, 0, 0.08, 0.2)
		"metal_groan":
			b = Buf.new(2.2)
			b.osc("sawtooth", 70, 52, 0, 2.0, 0.1, 0.6)
			b.noise(0, 2.0, 0.12, "bandpass", 300, 20, 0.6)
		"heartbeat":
			b = Buf.new(0.7)
			b.osc("sine", 60, 40, 0, 0.15, 1.0, 0.005)
			b.osc("sine", 55, 38, 0.22, 0.15, 0.8, 0.005)
		"drone":
			b = Buf.new(4.0)
			for i in b.data.size():
				var t = float(i) / RATE
				b.data[i] = (sin(TAU * 55.0 * t) * 0.3 + sin(TAU * 82.5 * t + sin(TAU * 0.25 * t) * 2.0) * 0.15 + sin(TAU * 110.7 * t) * 0.08) * (0.7 + 0.3 * sin(TAU * 0.5 * t))
			bank[sname] = b.to_wav(true)
			return bank[sname]
		"ui":
			b = Buf.new(0.15)
			b.osc("triangle", 660, 880, 0, 0.08, 0.3)
		"ui_bad":
			b = Buf.new(0.25)
			b.osc("square", 220, 160, 0, 0.15, 0.2)
		"celebrate":
			b = Buf.new(1.1)
			for i in 4:
				b.osc("triangle", [523, 659, 784, 1046][i], 0, i * 0.1, 0.4, 0.25)
		"fail":
			b = Buf.new(1.4)
			for i in 4:
				var f = [392, 370, 349, 262][i]
				b.osc("triangle", f, f * 0.98, i * 0.28, 0.4, 0.25)
		_:
			return get_sound("impact")
	bank[sname] = b.to_wav()
	return bank[sname]


# Sons utilisés dès le début : générés pendant le chargement plutôt qu'en pleine partie.
func preload_common() -> void:
	for n in ["step", "door", "impact", "monster", "click", "kaching", "voice", "drone", "heartbeat", "ui", "hit", "scream"]:
		get_sound(n)


func play_at(sname: String, pos: Vector3, vol_db := 0.0, pitch := 1.0) -> void:
	var p: AudioStreamPlayer3D = pool[pool_i]
	pool_i = (pool_i + 1) % pool.size()
	p.stream = get_sound(sname)
	p.global_position = pos
	p.volume_db = vol_db + master_db
	p.pitch_scale = pitch
	p.play()


func play_ui(sname: String, vol_db := -6.0) -> void:
	ui_player.stream = get_sound(sname)
	ui_player.volume_db = vol_db + master_db
	ui_player.play()


func start_ambience() -> void:
	ambience.stream = get_sound("drone")
	ambience.volume_db = -16.0 + master_db
	ambience.play()


func stop_all() -> void:
	ambience.stop()
	heart.stop()
	for p in pool:
		p.stop()


# fear : 0..1 (proximité d'une créature) ; listener : position de la caméra
func update_ambience(dt: float, fear: float, listener: Vector3) -> void:
	heart_t -= dt
	if fear > 0.25 and heart_t <= 0:
		heart_t = lerpf(1.1, 0.42, fear)
		heart.stream = get_sound("heartbeat")
		heart.volume_db = lerpf(-20.0, -3.0, fear) + master_db
		heart.play()
	creak_t -= dt
	if creak_t <= 0:
		creak_t = rng.randf_range(5.0, 14.0)
		var off = Vector3(rng.randf_range(-12, 12), rng.randf_range(0.5, 2.8), rng.randf_range(-12, 12))
		play_at(["amb_creak", "drip", "metal_groan", "amb_creak"][rng.randi() % 4], listener + off, -8.0)


func set_master(volume: float) -> void:
	master_db = linear_to_db(maxf(0.001, volume))
