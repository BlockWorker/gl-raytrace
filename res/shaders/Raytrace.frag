#version 430

const float INFINITY = uintBitsToFloat(0x7F800000);
const float EPSILON = 1e-4f;

const uint RECURSION_DEPTH = 7;
const uint NUM_LIGHTS = 15;
const uint NUM_SPHERES = 15;

struct Ray
{
	vec3 origin;
	vec3 direction;
};

layout(location = 0) out vec4 fragColor;

in vec3 pixel_position;

uniform vec2 pixel_size;

uniform sampler2D textures[20];
uniform vec3 cam_pos;
uniform vec3 img_origin;
uniform vec3 img_right;
uniform vec3 img_up;

uniform vec4 ground_plane;

uniform vec3 light_positions[NUM_LIGHTS];
uniform vec4 light_colors[NUM_LIGHTS];

uniform vec4 spheres[NUM_SPHERES];
uniform vec3 sphere_ambient[NUM_SPHERES];
uniform vec3 sphere_diffuse[NUM_SPHERES];
uniform vec4 sphere_specular[NUM_SPHERES];

bool plane_intersect(const in vec4 plane, const in Ray ray, out float t)
{
	float dn = dot(ray.direction, plane.xyz);
	if (abs(dn) < 1e-6f) return false;
	float en = dot(ray.origin, plane.xyz);
	t = (plane.w - en) / dn;
	return true;
}

bool sphere_intersect(const in vec4 sphere, const in Ray ray, out float t)
{
	float t0, t1;
	vec3 L = ray.origin - sphere.xyz;
    float a = dot(ray.direction, ray.direction);
    float b = 2.0f * dot(ray.direction, L);
    float c = dot(L, L) - sphere.w * sphere.w;
    // solve quadratic function
    float discr = b*b - 4.0f * a * c;
    if (discr < 0.0f)
        return false;
    else if (discr == 0.0f)
    {
        t0 = -0.5f * b / a;
        t1 = t0;
    }
    else
    {
        float q = (b > 0) ? -0.5f * (b + sqrt(discr)) : -0.5f * (b - sqrt(discr));
        t0 = q / a;
        t1 = c / q;
    }

	if (t0 > t1)
	{
		float temp = t0;
		t0 = t1;
		t1 = temp;
	}

    if (t0 < 0)
    {
        t0 = t1; // use t1 if t0 is negative
        if (t0 < 0) return false; // both negative
    }

    t = t0;
	return true;
}

vec4 plane_color(const in vec3 position)
{
	return texture(textures[0], (position.xz / 10.0f) - .25f);
}

vec4 object_color(const in uint object, const in vec3 position, const in uint type)
{
	if (object == 0) //ground plane
	{
		switch (type)
		{
			case 0:
			case 1:
				return plane_color(position);
			default:
				return vec4(1.0f, 1.0f, 1.0f, 40.0f);
		}
	}
	else if (object <= NUM_SPHERES) //sphere
	{
		uint sphere_id = object - 1;
		switch (type)
		{
			case 0:
				return vec4(sphere_ambient[sphere_id], 1.0f);
			case 1:
				return vec4(sphere_diffuse[sphere_id], 1.0f);
			default:
				return sphere_specular[sphere_id];
		}
	}
}

vec3 phong_lighting(const in vec3 view_dir, const in vec3 normal, const in vec3 ambient, const in vec3 diffuse, const in vec4 specular,
					const in vec3 light_dir, const in vec3 light_color, const in float light_intensity)
{
	vec3 result = ambient * light_color * light_intensity;

	float normal_dot_light_dir = dot(normal, -light_dir);

	if (normal_dot_light_dir > 0.0f)
	{
		result += diffuse * light_color * (light_intensity * normal_dot_light_dir);

		float reflection_dot_view = dot(reflect(light_dir, normal), view_dir);
        if (reflection_dot_view > 0)
		{
            result += specular.rgb * light_color * (light_intensity * pow(reflection_dot_view, specular.w));
        }
	}

	return result;
}

bool trace(const in Ray ray, out float t, out vec3 hit_pos, out vec3 hit_normal, out uint hit_object)
{
	t = INFINITY;
	bool hit = false;

	float t_obj;

	if (plane_intersect(ground_plane, ray, t_obj) && t_obj < t && t_obj > 0.0f) {
		t = t_obj;
		hit_pos = ray.origin + t * ray.direction;
		hit = true;
		hit_normal = ground_plane.xyz;
		hit_object = 0;
	}

	for (uint i = 0; i < NUM_SPHERES; i++)
	{
		vec4 sphere = spheres[i];
		if (sphere.w < EPSILON) continue;

		if (sphere_intersect(sphere, ray, t_obj) && t_obj < t && t_obj > 0.0f) {
			t = t_obj;
			hit_pos = ray.origin + t * ray.direction;
			hit = true;
			hit_normal = normalize(hit_pos - sphere.xyz);
			hit_object = i + 1;
		}
	}

	return hit;
}

bool simple_trace(const in Ray ray, out float t)
{
	vec3 hit_pos;
	vec3 hit_normal;
	uint hit_object;
	return trace(ray, t, hit_pos, hit_normal, hit_object);
}

bool cast_ray(Ray ray, out vec3 color, out vec3 hit_pos, out vec3 hit_normal)
{
	color = vec3(0.0f);

	float hit_t;
	uint hit_object;
	if (trace(ray, hit_t, hit_pos, hit_normal, hit_object) && hit_t >= 0.0f)
	{
		vec3 ambient = object_color(hit_object, hit_pos, 0).rgb;
		vec3 diffuse = object_color(hit_object, hit_pos, 1).rgb;
		vec4 specular = object_color(hit_object, hit_pos, 2);

		vec3 view_dir = -normalize(ray.direction);

		Ray shadow_ray;
        double shadow_t;
		shadow_ray.origin = hit_pos + EPSILON * hit_normal;

		for (uint i = 0; i < NUM_LIGHTS; i++)
		{
			float light_intensity_raw = light_colors[i].w;
			if (light_intensity_raw < EPSILON) continue;
			vec3 light_pos = light_positions[i];
			vec3 light_color = light_colors[i].rgb;

			shadow_ray.direction = light_pos - shadow_ray.origin;

			float light_distance = length(shadow_ray.direction);
			float light_intensity = light_intensity_raw / (light_distance * light_distance);

			shadow_t = INFINITY;
			simple_trace(shadow_ray, shadow_t);

			if (shadow_t < 0.0f || shadow_t > 1.0f) color += phong_lighting(view_dir, hit_normal, ambient, diffuse, specular, -shadow_ray.direction / light_distance, light_color, light_intensity);
			else color += ambient * light_color * light_intensity;
		}

		color += ambient / 15.0f;
		color = clamp(color, 0.0f, 1.0f);

		return true;
	}

	return false;
}

void main()
{   	
	Ray ray;
	ray.origin = cam_pos;
	vec3 color;

	vec2 sample_offset = pixel_size * gl_SamplePosition;

	vec3 rayTarget = img_origin + (pixel_position.x + sample_offset.x) * img_right + (pixel_position.y + sample_offset.y) * img_up;
	ray.direction = rayTarget - cam_pos;

	vec3 hit_pos, hit_normal;
	vec3 colors[RECURSION_DEPTH];

	for (uint i = 0; i < RECURSION_DEPTH; i++) colors[i] = vec3(0.0f);

	for (uint i = 0; i < RECURSION_DEPTH; i++)
	{
		if (!cast_ray(ray, colors[i], hit_pos, hit_normal)) break;
		ray.origin = hit_pos + EPSILON * hit_normal;
		ray.direction = reflect(ray.direction, hit_normal);
	}

	for (uint i = RECURSION_DEPTH - 1; i > 0; i--)
	{
		colors[i - 1] += colors[i] * .9f;
	}
	color = colors[0];

	fragColor = vec4(color, 1.0f);
}