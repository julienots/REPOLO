// Post-traitement « caméra d'horreur » : vignette, grain, aberration chromatique et
// distorsion quand une créature est proche ou que l'on est blessé, voile rouge à terre.
shader_type canvas_item;

uniform sampler2D screen_tex : hint_screen_texture, filter_linear_mipmap;
uniform float fear = 0.0;      // 0..1 proximité d'une créature
uniform float hurt = 0.0;      // 0..1 blessure récente
uniform float downed = 0.0;    // 0..1 à terre
uniform float grain = 0.06;
uniform float vignette = 0.55;
uniform float time_s = 0.0;
uniform float desat = 0.15;

float rnd(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + time_s * 13.17) * 43758.5453); }

void fragment() {
	vec2 uv = SCREEN_UV;
	vec2 c = uv - 0.5;
	float r2 = dot(c, c);
	// distorsion / tremblement
	float wob = fear * 0.004 * sin(time_s * 23.0 + uv.y * 40.0) + downed * 0.006 * sin(time_s * 3.0 + uv.x * 9.0);
	uv.x += wob;
	float ca = 0.0015 + fear * 0.006 + hurt * 0.012;
	vec3 col;
	col.r = textureLod(screen_tex, uv + c * ca, 0.0).r;
	col.g = textureLod(screen_tex, uv, 0.0).g;
	col.b = textureLod(screen_tex, uv - c * ca, 0.0).b;
	// vision floue à terre
	if (downed > 0.0) {
		vec3 bl = textureLod(screen_tex, uv, 2.5).rgb;
		col = mix(col, bl, downed * 0.6);
	}
	float l = dot(col, vec3(0.299, 0.587, 0.114));
	col = mix(col, vec3(l), desat + downed * 0.5);
	col = mix(col, col * vec3(1.25, 0.55, 0.5), hurt * 0.6 + downed * 0.35);
	float vig = smoothstep(0.85, 0.15, r2 * (vignette + fear * 0.6 + downed * 0.8) * 2.2);
	col *= vig;
	col += (rnd(uv * 512.0) - 0.5) * (grain + fear * 0.07);
	COLOR = vec4(col, 1.0);
}
