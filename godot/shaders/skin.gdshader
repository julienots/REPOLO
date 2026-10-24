// Peau / matières organiques des créatures : marbrures, veines, aspect humide (reflets),
// assombrissement des creux, liseré de lumière rasante (effet « peau translucide »).
shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_burley, specular_schlick_ggx;

uniform vec4 base_color : source_color = vec4(0.55, 0.5, 0.47, 1.0);
uniform vec4 dark_color : source_color = vec4(0.18, 0.12, 0.12, 1.0);
uniform vec4 vein_color : source_color = vec4(0.3, 0.05, 0.08, 1.0);
uniform vec4 rim_color : source_color = vec4(0.9, 0.6, 0.55, 1.0);
uniform sampler2D noise_tex : filter_linear_mipmap, repeat_enable;
uniform float scale = 2.2;
uniform float wetness = 0.6;
uniform float veins = 0.6;
uniform float rim = 0.35;
uniform float plastic = 0.0;      // Mannequine : plastique brillant fissuré
uniform float emission_boost = 0.0;

varying vec3 lpos;
varying vec3 lnrm;

void vertex() {
	lpos = VERTEX;
	lnrm = NORMAL;
}

float tri(vec3 p, vec3 w, float s) {
	return texture(noise_tex, p.zy * s).r * w.x + texture(noise_tex, p.xz * s).r * w.y + texture(noise_tex, p.xy * s).r * w.z;
}

void fragment() {
	vec3 w = pow(abs(normalize(lnrm)), vec3(3.0));
	w /= (w.x + w.y + w.z);
	float m = tri(lpos, w, scale);
	float f = tri(lpos, w, scale * 4.0);
	float vn = tri(lpos + vec3(3.1), w, scale * 1.7);
	float vein = (1.0 - smoothstep(0.0, 0.035, abs(vn - 0.5))) * veins;
	vec3 col = mix(dark_color.rgb, base_color.rgb, smoothstep(0.2, 0.8, m * 0.7 + f * 0.3));
	col = mix(col, vein_color.rgb, vein * 0.8);
	float crack = 0.0;
	if (plastic > 0.0) {
		crack = (1.0 - smoothstep(0.0, 0.012, abs(f - 0.52))) * plastic;
		col = mix(col, dark_color.rgb * 0.4, crack);
	}
	float rough = mix(0.65, 0.18, wetness * smoothstep(0.3, 0.7, f));
	rough = mix(rough, 0.12, plastic * (1.0 - crack));
	float fres = pow(1.0 - clamp(dot(NORMAL, VIEW), 0.0, 1.0), 3.0);
	ALBEDO = col;
	ROUGHNESS = rough;
	SPECULAR = 0.5 + plastic * 0.3;
	EMISSION = rim_color.rgb * fres * rim * 0.25 + base_color.rgb * emission_boost;
	// relief
	float e = 0.02;
	float h0 = tri(lpos, w, scale * 4.0);
	float hx = tri(lpos + vec3(e, 0, 0), w, scale * 4.0);
	float hy = tri(lpos + vec3(0, e, 0), w, scale * 4.0);
	float hz = tri(lpos + vec3(0, 0, e), w, scale * 4.0);
	vec3 g = vec3(hx - h0, hy - h0, hz - h0) * 10.0;
	vec3 ln = normalize(lnrm - g * (0.6 - plastic * 0.4));
	NORMAL = normalize((VIEW_MATRIX * MODEL_MATRIX * vec4(ln, 0.0)).xyz);
}
