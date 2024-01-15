#version 430

const float INFINITY = uintBitsToFloat(0x7F800000);
const float EPSILON = 1e-4f;
const float PI = 3.14159265359f;
const float TWOPI = 2.0f * PI;

const uint RECURSION_DEPTH = 5;
const uint MAX_RAYS = 31;

struct Ray
{
	vec3 origin;
	vec3 direction;
	vec3 color_mult;
	int depth;
	bool transmitted;
};

struct Material
{
	vec3 ambient;
	vec4 diffuse;
	vec4 specular;
	vec3 emissive;
	vec3 reflective;
	ivec4 textures;
	int normalmap;
	float eta;
};

struct Vertex
{
	vec3 position;
	vec3 normal;
	vec2 uv;
	Material material;
};

struct Triangle
{
	uvec3 indices;
	vec3 normal;
	mat2 uvtrans;
	vec4 enc_sphere;
};

struct Light
{
	int type;
	vec3 position;
	vec3 direction;
	vec3 color;
	float intensity;
};

struct Sphere
{
	vec4 definition;
	Material material;
};

layout(location = 0) out vec4 fragColor;

in vec3 pixel_position;

uniform vec3 cam_pos;
uniform vec3 img_origin;
uniform vec3 img_right;
uniform vec3 img_up;

uniform vec4 ground_plane;

uniform sampler2D textures[20];
uniform vec2 pixel_size;


layout(std430, binding = 0) buffer LightBuffer
{
	Light lights[];
};

layout(std430, binding = 1) buffer SphereBuffer
{
	Sphere spheres[];
};

layout(std430, binding = 2) buffer VertexBuffer
{
	Vertex vertices[];
};

layout(std430, binding = 3) buffer TriangleBuffer
{
	Triangle triangles[];
};


float max_axis(const in vec3 v)
{
	vec3 vabs = abs(v);
	return max(vabs.x, max(vabs.y, vabs.z));
}

bool plane_intersect(const in vec4 plane, const in Ray ray, out float t, out bool backface)
{
	float dn = dot(ray.direction, plane.xyz);
	backface = dn > -EPSILON;
	float en = dot(ray.origin, plane.xyz);
	t = (plane.w - en) / dn;
	return true;
}

bool sphere_intersect(const in Sphere sphere, const in Ray ray, out float t, out float t2, out bool backface)
{
	float t0, t1;
	vec3 L = ray.origin - sphere.definition.xyz;

	float c = (-sphere.definition.w * sphere.definition.w) + dot(L, L);
	backface = c < 0.0f;

	float cosangle = dot(ray.direction, -L);

	if (!backface)
	{
		float limit = (sphere.definition.w / -3.0f) + length(L);
		if (cosangle < limit) return false;
	}

	float a = dot(ray.direction, ray.direction);
	float b = -2.0f * cosangle;
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
	t2 = t1;
	return true;
}

bool triangle_intersect(const in Triangle triangle, const in Ray ray, out float t, out vec3 hit_bary, const in bool ignore_backface, out bool backface)
{
	backface = dot(ray.direction, triangle.normal) > -EPSILON;
	if (backface && ignore_backface) return false;

	vec3 to_center = triangle.enc_sphere.xyz - ray.origin;
	float enc_dot = dot(ray.direction, to_center);
	float limit = (triangle.enc_sphere.w / -3.0f) + length(to_center);
	if (enc_dot < limit) return false;

	vec3 vert1 = vertices[triangle.indices.x].position;
	vec3 vert2 = vertices[triangle.indices.y].position;
	vec3 vert3 = vertices[triangle.indices.z].position;

	vec3 col1 = -ray.direction;
	vec3 col2 = vert2 - vert1;
	vec3 col3 = vert3 - vert1;
	vec3 rhs = ray.origin - vert1;

	float mdet = determinant(mat3(col1, col2, col3));

	hit_bary.y = determinant(mat3(col1, rhs, col3)) / mdet;
	if (hit_bary.y < 0.0f) return false;

	hit_bary.z = determinant(mat3(col1, col2, rhs)) / mdet;
	if (hit_bary.z < 0.0f || hit_bary.y + hit_bary.z > 1.0f) return false;
	hit_bary.x = 1.0f - hit_bary.y - hit_bary.z;

	t = determinant(mat3(rhs, col2, col3)) / mdet;
	return true;
}

void get_object_properties(const in uint object, const in vec3 position, const in vec3 bary, out Material mat, out vec3 normal)
{
	vec2 uv = vec2(0.0f);

	if (object == 0) //ground plane
	{
		mat.diffuse = vec4(1.0f);
		mat.ambient = mat.diffuse.xyz;
		mat.specular = vec4(1.0f, 1.0f, 1.0f, 40.0f);
		mat.emissive = mat.ambient / 15.0f;
		mat.reflective = vec3(0.0f);
		mat.textures = ivec4(0, -1, 0, -1);
		uv = (position.xz / 10.0f) - .25f;
		vec3 snormal = ground_plane.xyz;
		vec3 tanx, tany;
		if (snormal.x == 0.0f && snormal.z == 0.0f)
		{
			tanx = vec3(1.0f, 0.0f, 0.0f);
			tany = vec3(0.0f, 0.0f, 1.0f);
		}
		else
		{
			tanx = cross(vec3(0.0f, 1.0f, 0.0f), snormal);
			tany = cross(snormal, tanx);
		}
		vec3 map_normal = 2.0f * texture(textures[1], uv).xyz - 1.0f;
		normal = normalize(map_normal.x * tanx + map_normal.y * tany + map_normal.z * snormal);
		//normal = snormal;
	}
	else if (object <= spheres.length()) //sphere
	{
		Sphere sphere = spheres[object - 1];
		mat = sphere.material;
		vec3 snormal = normalize(position - sphere.definition.xyz);
		uv = vec2(asin(snormal.x) / TWOPI, acos(snormal.y) / PI);
		normal = snormal;
		if (mat.normalmap < 0) normal = snormal;
		else
		{
			vec3 tanx, tany;
			if (snormal.x == 0.0f && snormal.z == 0.0f)
			{
				tanx = vec3(1.0f, 0.0f, 0.0f);
				tany = vec3(0.0f, 0.0f, 1.0f);
			}
			else
			{
				tanx = cross(vec3(0.0f, 1.0f, 0.0f), snormal);
				tany = cross(snormal, tanx);
			}
			vec3 map_normal = 2.0f * texture(textures[mat.normalmap], uv).xyz - 1.0f;
			normal = normalize(map_normal.x * tanx + map_normal.y * tany + map_normal.z * snormal);
		}
	}
	else
	{
		Triangle tri = triangles[object - spheres.length() - 1];
		Vertex vert1 = vertices[tri.indices.x];
		Vertex vert2 = vertices[tri.indices.y];
		Vertex vert3 = vertices[tri.indices.z];

		mat.ambient = bary.x * vert1.material.ambient + bary.y * vert2.material.ambient + bary.z * vert3.material.ambient;
		mat.diffuse = bary.x * vert1.material.diffuse + bary.y * vert2.material.diffuse + bary.z * vert3.material.diffuse;
		mat.specular = bary.x * vert1.material.specular + bary.y * vert2.material.specular + bary.z * vert3.material.specular;
		mat.emissive = bary.x * vert1.material.emissive + bary.y * vert2.material.emissive + bary.z * vert3.material.emissive;
		mat.reflective = bary.x * vert1.material.reflective + bary.y * vert2.material.reflective + bary.z * vert3.material.reflective;
		mat.textures = vert1.material.textures;
		mat.normalmap = vert1.material.normalmap;
		mat.eta = bary.x * vert1.material.eta + bary.y * vert2.material.eta + bary.z * vert3.material.eta;

		uv = bary.x * vert1.uv + bary.y * vert2.uv + bary.z * vert3.uv;

		vec3 snormal = normalize(bary.x * vert1.normal + bary.y * vert2.normal + bary.z * vert3.normal);
		if (mat.normalmap < 0 || tri.uvtrans == mat2(0.0f, 0.0f, 0.0f, 0.0f)) normal = snormal;
		else
		{
			vec3 bar1 = vert2.position - vert1.position;
			vec3 bar2 = vert3.position - vert1.position;

			vec3 map_normal = 2.0f * texture(textures[mat.normalmap], uv).xyz - 1.0f;

			vec2 transformed_xy = tri.uvtrans * map_normal.xy;

			normal = normalize(transformed_xy.x * bar1 + transformed_xy.y * bar2 + map_normal.z * snormal);
		}
	}

	if (mat.textures.x >= 0)
	{
		vec4 texVal = texture(textures[mat.textures.x], uv);
		mat.ambient *= texVal.rgb;
		mat.diffuse *= texVal;
	}
	if (mat.textures.y >= 0) mat.specular.xyz *= texture(textures[mat.textures.y], uv).rgb;
	if (mat.textures.z >= 0) mat.emissive *= texture(textures[mat.textures.z], uv).rgb;
	if (mat.textures.w >= 0) mat.reflective *= texture(textures[mat.textures.w], uv).rgb;
}

vec3 phong_lighting(const in vec3 view_dir, const in vec3 normal, const in Material material,
					const in vec3 light_dir, const in vec3 light_color, const in float light_intensity)
{
	vec3 result = material.ambient * light_color * light_intensity;

	float normal_dot_light_dir = dot(normal, -light_dir);

	if (normal_dot_light_dir > 0.0f)
	{
		result += material.diffuse.rgb * light_color * (light_intensity * normal_dot_light_dir);

		float reflection_dot_view = dot(reflect(light_dir, normal), view_dir);
		if (reflection_dot_view > 0)
		{
			result += material.specular.rgb * light_color * (light_intensity * pow(reflection_dot_view, material.specular.w));
		}
	}

	return result * material.diffuse.a;
}

bool trace(const in Ray ray, out float t, out vec3 hit_pos, out uint hit_object, out vec3 hit_bary, out bool backface)
{
	t = INFINITY;
	bool hit = false;
	hit_bary = vec3(0.0f);
	backface = false;

	float t_obj, t_discard;
	bool obj_backface;
	vec3 obj_bary;

	if (plane_intersect(ground_plane, ray, t_obj, obj_backface) && t_obj < t && t_obj > 0.0f && (ray.transmitted || !obj_backface))
	{
		t = t_obj;
		hit_pos = ray.origin + t * ray.direction;
		hit = true;
		hit_object = 0;
		backface = obj_backface;
	}

	for (uint i = 0; i < spheres.length(); i++)
	{
		Sphere sphere = spheres[i];
		if (sphere.definition.w < EPSILON) continue;

		if (sphere_intersect(sphere, ray, t_obj, t_discard, obj_backface) && t_obj < t && t_obj > 0.0f && (ray.transmitted || !obj_backface))
		{
			t = t_obj;
			hit_pos = ray.origin + t * ray.direction;
			hit = true;
			hit_object = i + 1;
			backface = obj_backface;
		}
	}

	for (uint i = 0; i < triangles.length(); i++)
	{
		Triangle triangle = triangles[i];
		
		if (triangle_intersect(triangle, ray, t_obj, obj_bary, !ray.transmitted, obj_backface) && t_obj < t && t_obj > 0.0f)
		{
			t = t_obj;
			hit_pos = ray.origin + t * ray.direction;
			hit = true;
			hit_object = i + spheres.length() + 1;
			hit_bary = obj_bary;
			backface = obj_backface;
		}
	}

	return hit;
}

bool shadow_trace(const in Ray ray, out vec3 color_mult)
{
	vec3 hit_pos, hit_bary, hit_normal = vec3(0.0f);
	Material hit_mat;

	color_mult = vec3(1.0f);

	float t_obj, t_discard;
	bool obj_backface;

	if (plane_intersect(ground_plane, ray, t_obj, obj_backface) && t_obj < 1.0f && t_obj > 0.0f && obj_backface)
	{
		hit_pos = ray.origin + t_obj * ray.direction;
		get_object_properties(0, hit_pos, hit_bary, hit_mat, hit_normal);
		color_mult *= hit_mat.diffuse.rgb * (1.0f - hit_mat.diffuse.a);
		if (color_mult.r + color_mult.g + color_mult.b < 0.01f) return false;
	}

	for (uint i = 0; i < spheres.length(); i++)
	{
		Sphere sphere = spheres[i];
		if (sphere.definition.w < EPSILON) continue;

		if (sphere_intersect(sphere, ray, t_discard, t_obj, obj_backface) && t_obj < 1.0f && t_obj > 0.0f)
		{
			hit_pos = ray.origin + t_obj * ray.direction;
			get_object_properties(i + 1, hit_pos, hit_bary, hit_mat, hit_normal);
			color_mult *= hit_mat.diffuse.rgb * (1.0f - hit_mat.diffuse.a);
			if (color_mult.r + color_mult.g + color_mult.b < 0.01f) return false;
		}
	}

	for (uint i = 0; i < triangles.length(); i++)
	{
		Triangle triangle = triangles[i];
		
		if (triangle_intersect(triangle, ray, t_obj, hit_bary, false, obj_backface) && t_obj < 1.0f && t_obj > 0.0f && obj_backface)
		{
			hit_pos = ray.origin + t_obj * ray.direction;
			get_object_properties(i + spheres.length() + 1, hit_pos, hit_bary, hit_mat, hit_normal);
			color_mult *= hit_mat.diffuse.rgb * (1.0f - hit_mat.diffuse.a);
			if (color_mult.r + color_mult.g + color_mult.b < 0.01f) return false;
		}
	}

	return true;
}

bool cast_ray(Ray ray, out vec3 color, out vec3 hit_pos, out vec3 hit_normal, out Material hit_material, out bool backface)
{
	color = vec3(0.0f);

	float hit_t;
	uint hit_object;
	vec3 hit_bary;

	if (trace(ray, hit_t, hit_pos, hit_object, hit_bary, backface) && hit_t >= 0.0f)
	{
		get_object_properties(hit_object, hit_pos, hit_bary, hit_material, hit_normal);

		if (ray.depth >= RECURSION_DEPTH - 1) hit_material.diffuse.a = 1.0f;

		vec3 view_dir = -normalize(ray.direction);

		Ray shadow_ray;
		bool light_visible;
		vec3 light_color_mult, light_color;
		float light_intensity, light_distance;
		shadow_ray.origin = hit_pos + EPSILON * hit_normal;

		for (uint i = 0; i < lights.length(); i++)
		{
			Light light = lights[i];
			
			if (light.intensity < EPSILON) continue;

			switch(light.type)
			{
				case 0:
					shadow_ray.direction = light.position - shadow_ray.origin;

					light_distance = length(shadow_ray.direction);
					light_intensity = light.intensity / (light_distance * light_distance);
					if (light_intensity < 0.01f) continue;
					break;
				case 1:
					shadow_ray.direction = -100.0f * light.direction;
					light_distance = 100.0f;
					light_intensity = light.intensity;
					break;
			}

			light_visible = shadow_trace(shadow_ray, light_color_mult);			
			light_color = light.color * light_color_mult;

			if (light_visible) color += phong_lighting(view_dir, hit_normal, hit_material, -shadow_ray.direction / light_distance, light_color, light_intensity);
			else color += hit_material.ambient * light_color * light_intensity;
		}

		color += hit_material.emissive;

		return true;
	}

	return false;
}

void main()
{   	
	vec3 color;

	vec2 sample_pos = pixel_position.xy + pixel_size * gl_SamplePosition;

	Ray start_ray;
	start_ray.origin = cam_pos;
	vec3 ray_target = img_origin + sample_pos.x * img_right + sample_pos.y * img_up;
	start_ray.direction = normalize(ray_target - cam_pos);
	start_ray.color_mult = vec3(1.0f);
	start_ray.depth = 0;
	start_ray.transmitted = false;

	Ray rays[MAX_RAYS];
	uint next_ray = 1;
	for (uint i = 1; i < MAX_RAYS; i++) rays[i].depth = -1;
	rays[0] = start_ray;

	vec3 hit_pos, hit_normal, hit_color = vec3(0.0f);
	Material hit_material;
	bool backface, total_reflection;
	Ray ray, trans_ray, refl_ray;

	for (uint i = 0; i < MAX_RAYS; i++)
	{
		ray = rays[i];
		if (ray.depth < 0) break;
		if (!cast_ray(ray, hit_color, hit_pos, hit_normal, hit_material, backface)) continue;

		if (!backface) color += ray.color_mult * hit_color;

		if (ray.depth >= RECURSION_DEPTH - 1 || next_ray >= MAX_RAYS) continue;

		if (hit_material.diffuse.a < 0.99f)
		{
			if (backface) trans_ray.color_mult = ray.color_mult;
			else trans_ray.color_mult = ray.color_mult * hit_material.diffuse.rgb * (1.0f - hit_material.diffuse.a);
			
			if (hit_material.eta != 1.0f)
			{
				if (backface) trans_ray.direction = refract(ray.direction, -hit_normal, 1.0f / hit_material.eta);
				else trans_ray.direction = refract(ray.direction, hit_normal, hit_material.eta);
				total_reflection = abs(trans_ray.direction.x) + abs(trans_ray.direction.y) + abs(trans_ray.direction.z) < 0.5f;
			}
			else
			{
				trans_ray.direction = ray.direction;
				total_reflection = false;
			}

			if (!total_reflection && trans_ray.color_mult.r + trans_ray.color_mult.g + trans_ray.color_mult.b > 0.01f)
			{
				if (backface) trans_ray.origin = hit_pos + EPSILON * hit_normal;
				else trans_ray.origin = hit_pos - EPSILON * hit_normal;
				trans_ray.depth = ray.depth + 1;
				trans_ray.transmitted = true;
				rays[next_ray++] = trans_ray;
			}
		}
		else total_reflection = true;

		if (next_ray < MAX_RAYS && hit_material.reflective.r + hit_material.reflective.g + hit_material.reflective.b > 0.01f)
		{

			vec3 schlick_reflectivity = hit_material.reflective;
			if (!total_reflection)
			{
				float normal_refl = (hit_material.eta - 1.0f) / (hit_material.eta + 1.0f);
				schlick_reflectivity *= normal_refl * normal_refl;
				float refl_scale = 1.0f - abs(dot(hit_normal, ray.direction));
				schlick_reflectivity += (1.0f - schlick_reflectivity) * (refl_scale * refl_scale * refl_scale * refl_scale * refl_scale);
			}
			refl_ray.color_mult = ray.color_mult * mix(schlick_reflectivity, hit_material.reflective, hit_material.diffuse.a);

			if (backface)
			{
				refl_ray.origin = hit_pos - EPSILON * hit_normal;
				refl_ray.direction = reflect(ray.direction, -hit_normal);
			}
			else
			{
				refl_ray.origin = hit_pos + EPSILON * hit_normal;
				refl_ray.direction = reflect(ray.direction, hit_normal);
			}

			if (refl_ray.color_mult.r + refl_ray.color_mult.g + refl_ray.color_mult.b > 0.01f)
			{
				refl_ray.depth = ray.depth + 1;
				refl_ray.transmitted = ray.transmitted;
				rays[next_ray++] = refl_ray;
			}
		}
	}

	fragColor = vec4(color, 1.0f);
}