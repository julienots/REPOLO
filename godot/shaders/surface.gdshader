// Surfaces du décor : projection triplanaire en coordonnées monde (aucune UV nécessaire),
// motifs procéduraux (béton, carrelage, parquet, métal, papier peint), crasse au pied des
// murs, taches d'humidité, relief calculé depuis une texture de bruit.
shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_burley, specular_schlick_ggx;

uniform vec4 color_a : source_color = vec4(0.35, 0.35, 0.33, 1.0);
uniform vec4 color_b : source_color = vec4(0.22, 0.22, 0.21, 1.0);
uniform vec4 grime_color : source_color = vec4(0.08, 0.07, 0.05, 1.0);
uniform sampler2D noise_tex : filter_linear_mipmap, repeat_enable;
uniform float scale = 0.35;
uniform float detail_scale = 2.3;
uniform int pattern = 0;          // 0 béton, 1 carrelage, 2 parquet, 3 métal, 4 papier peint, 5 grille
uniform float tile_size = 1.0;
uniform float roughness_min = 0.55;
uniform float roughness_max = 0.95;
uniform float metal = 0.0;
uniform float bump = 0.6;
uniform float grime_height = 0.6;  // crasse au pied des murs (m)
uniform float stains = 0.5;
uniform float wet = 0.0;           // flaques (sol)

varying vec3 wpos;
varying vec3 wnrm;

void vertex() {
	wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	wnrm = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
}

float tri(vec3 p, vec3 w, float s) {
	float x = texture(noise_tex, p.zy * s).r;
	float y = texture(noise_tex, p.xz * s).r;
	float z = texture(noise_tex, p.xy * s).r;
	return x * w.x + y * w.y + z * w.z;
}

vec2 plane_uv(vec3 p, vec3 n) {
	vec3 a = abs(n);
	if (a.y > a.x && a.y > a.z) return p.xz;
	if (a.x > a.z) return p.zy;
	return p.xy;
}

float pattern_mask(vec2 uv, out float cell_rand) {
	cell_rand = 0.0;
	if (pattern == 1 || pattern == 5) {
		vec2 g = uv / tile_size;
		vec2 c = floor(g);
		cell_rand = fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453);
		vec2 f = abs(fract(g) - 0.5);
		float edge = max(f.x, f.y);
		float w = pattern == 5 ? 0.38 : 0.47;
		return smoothstep(w, w + 0.025, edge);
	}
	if (pattern == 2) {
		vec2 g = vec2(uv.x / (tile_size * 0.22), uv.y / (tile_size * 1.6));
		float row = floor(g.x);
		g.y += fract(sin(row * 91.7) * 47.3);
		vec2 c = vec2(row, floor(g.y));
		cell_rand = fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453);
		float ex = abs(fract(g.x) - 0.5);
		float ey = abs(fract(g.y) - 0.5);
		return max(smoothstep(0.46, 0.49, ex), smoothstep(0.485, 0.498, ey));
	}
	if (pattern == 4) {
		float s = fract(uv.x / (tile_size * 0.18));
		cell_rand = step(0.5, s);
		return 0.0;
	}
	return 0.0;
}

void fragment() {
	vec3 n = normalize(wnrm);
	vec3 w = pow(abs(n), vec3(4.0));
	w /= (w.x + w.y + w.z);
	float big = tri(wpos, w, scale * 0.25);
	float mid = tri(wpos, w, scale);
	float fine = tri(wpos, w, scale * detail_scale * 3.0);
	float cr;
	vec2 uv = plane_uv(wpos, n);
	float seam = pattern_mask(uv, cr);

	float v = mid * 0.55 + fine * 0.25 + big * 0.2;
	vec3 col = mix(color_b.rgb, color_a.rgb, clamp((v - 0.5) * 1.1 + 0.5, 0.0, 1.0));
	if (pattern == 1 || pattern == 5) col *= 0.85 + cr * 0.3;
	if (pattern == 2) col *= 0.75 + cr * 0.45;
	if (pattern == 4) col = mix(col, col * 0.78, cr);
	if (pattern == 3) {
		float brush = texture(noise_tex, vec2(uv.x * 0.05, uv.y * 6.0)).r;
		col *= 0.85 + brush * 0.3;
	}
	// taches d'humidité / moisissure
	float stain = smoothstep(0.6, 0.85, big) * stains;
	col = mix(col, col * vec3(0.7, 0.66, 0.58), stain);
	// crasse au pied des murs (et sous les plafonds)
	if (abs(n.y) < 0.5) {
		float g = 1.0 - smoothstep(0.0, grime_height, wpos.y);
		g *= 0.6 + fine * 0.6;
		col = mix(col, grime_color.rgb, clamp(g, 0.0, 0.85));
	}
	// joints sombres
	col = mix(col, grime_color.rgb * 0.8, seam * 0.85);

	float rough = mix(roughness_min, roughness_max, fine);
	rough = mix(rough, 1.0, seam * 0.5);
	float puddle = 0.0;
	if (n.y > 0.5 && wet > 0.0) {
		puddle = smoothstep(0.66, 0.72, big) * wet;
		rough = mix(rough, 0.05, puddle);
		col *= 1.0 - puddle * 0.35;
	}

	// relief : gradient du bruit fin dans le plan de la face
	float e = 0.015;
	vec3 tx = abs(n.y) > 0.5 ? vec3(1, 0, 0) : (abs(n.x) > abs(n.z) ? vec3(0, 0, 1) : vec3(1, 0, 0));
	vec3 ty = normalize(cross(n, tx));
	tx = normalize(cross(ty, n));
	float h0 = tri(wpos, w, scale * detail_scale);
	float hx = tri(wpos + tx * e, w, scale * detail_scale);
	float hy = tri(wpos + ty * e, w, scale * detail_scale);
	float b = bump * (1.0 - puddle);
	vec3 bn = normalize(n - (tx * (hx - h0) + ty * (hy - h0)) * b * 5.0);
	NORMAL = normalize((VIEW_MATRIX * vec4(bn, 0.0)).xyz);

	ALBEDO = col;
	ROUGHNESS = rough;
	METALLIC = metal;
	SPECULAR = 0.5;
}
