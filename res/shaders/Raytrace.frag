#version 430

const float INFINITY = uintBitsToFloat(0x7F800000);
const float EPSILON = 1e-4f;

const uint RECURSION_DEPTH = 5;

struct Ray
{
	vec3 origin;
	vec3 direction;
};

struct PhongCoefficients
{
	vec3 ambient;
	vec3 diffuse;
	vec4 specular;
};

struct Vertex
{
	vec3 position;
	vec3 normal;
	vec2 uv;
	PhongCoefficients coefficients;
};

struct Triangle
{
	uvec3 indices;
	vec3 normal;
};

struct PointLight
{
	vec3 position;
	vec3 color;
	float intensity;
};

struct Sphere
{
	vec4 definition;
	PhongCoefficients coefficients;
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

layout(std140, binding = 0) buffer PointLightBuffer
{
	PointLight lights[];
};

layout(std140, binding = 1) buffer SphereBuffer
{
	Sphere spheres[];
};

layout(std140, binding = 2) buffer VertexBuffer
{
	Vertex vertices[];
};

layout(std140, binding = 3) buffer TriangleBuffer
{
	Triangle triangles[];
};


bool plane_intersect(const in vec4 plane, const in Ray ray, out float t)
{
	float dn = dot(ray.direction, plane.xyz);
	if (dn > -EPSILON) return false; //back side of plane
	float en = dot(ray.origin, plane.xyz);
	t = (plane.w - en) / dn;
	return true;
}

bool sphere_intersect(const in vec4 sphere_def, const in Ray ray, out float t)
{
	float t0, t1;
	vec3 L = ray.origin - sphere_def.xyz;
    float a = dot(ray.direction, ray.direction);
    float b = 2.0f * dot(ray.direction, L);
    float c = dot(L, L) - sphere_def.w * sphere_def.w;
	if (c < 0.0f) return false; //camera inside sphere
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

bool triangle_intersect(const in Triangle triangle, const in Ray ray, out float t, out vec3 hit_bary)
{
	if (dot(ray.direction, triangle.normal) > -EPSILON) return false; //back side of triangle

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

vec4 plane_color(const in vec3 position)
{
	return texture(textures[0], (position.xz / 10.0f) - .25f);
}

void get_object_properties(const in uint object, const in vec3 position, const in vec3 bary, out PhongCoefficients coeffs, out vec3 normal)
{
	if (object == 0) //ground plane
	{
		coeffs.ambient = coeffs.diffuse = plane_color(position).rgb;
		coeffs.specular = vec4(1.0f, 1.0f, 1.0f, 40.0f);
		normal = ground_plane.xyz;
	}
	else if (object <= spheres.length()) //sphere
	{
		Sphere sphere = spheres[object - 1];
		coeffs = sphere.coefficients;
		normal = normalize(position - sphere.definition.xyz);
	}
	else
	{
		Triangle tri = triangles[object - spheres.length() - 1];
		Vertex vert1 = vertices[tri.indices.x];
		Vertex vert2 = vertices[tri.indices.y];
		Vertex vert3 = vertices[tri.indices.z];

		coeffs.ambient = bary.x * vert1.coefficients.ambient + bary.y * vert2.coefficients.ambient + bary.z * vert3.coefficients.ambient;
		coeffs.diffuse = bary.x * vert1.coefficients.diffuse + bary.y * vert2.coefficients.diffuse + bary.z * vert3.coefficients.diffuse;
		coeffs.specular = bary.x * vert1.coefficients.specular + bary.y * vert2.coefficients.specular + bary.z * vert3.coefficients.specular;

		normal = bary.x * vert1.normal + bary.y * vert2.normal + bary.z * vert3.normal;
	}
}

vec3 phong_lighting(const in vec3 view_dir, const in vec3 normal, const in PhongCoefficients coefficients,
					const in vec3 light_dir, const in vec3 light_color, const in float light_intensity)
{
	vec3 result = coefficients.ambient * light_color * light_intensity;

	float normal_dot_light_dir = dot(normal, -light_dir);

	if (normal_dot_light_dir > 0.0f)
	{
		result += coefficients.diffuse * light_color * (light_intensity * normal_dot_light_dir);

		float reflection_dot_view = dot(reflect(light_dir, normal), view_dir);
        if (reflection_dot_view > 0)
		{
            result += coefficients.specular.rgb * light_color * (light_intensity * pow(reflection_dot_view, coefficients.specular.w));
        }
	}

	return result;
}

bool trace(const in Ray ray, out float t, out vec3 hit_pos, out uint hit_object, out vec3 hit_bary)
{
	t = INFINITY;
	bool hit = false;
	hit_bary = vec3(0.0f);

	float t_obj;

	if (plane_intersect(ground_plane, ray, t_obj) && t_obj < t && t_obj > 0.0f)
	{
		t = t_obj;
		hit_pos = ray.origin + t * ray.direction;
		hit = true;
		hit_object = 0;
	}

	for (uint i = 0; i < spheres.length(); i++)
	{
		vec4 sphere_def = spheres[i].definition;
		if (sphere_def.w < EPSILON) continue;

		if (sphere_intersect(sphere_def, ray, t_obj) && t_obj < t && t_obj > 0.0f)
		{
			t = t_obj;
			hit_pos = ray.origin + t * ray.direction;
			hit = true;
			hit_object = i + 1;
		}
	}

	for (uint i = 0; i < triangles.length(); i++)
	{
		Triangle triangle = triangles[i];
		
		if (triangle_intersect(triangle, ray, t_obj, hit_bary) && t_obj < t && t_obj > 0.0f)
		{
			t = t_obj;
			hit_pos = ray.origin + t * ray.direction;
			hit = true;
			hit_object = i + spheres.length() + 1;
		}
	}

	return hit;
}

bool simple_trace(const in Ray ray, out float t)
{
	vec3 hit_pos;
	uint hit_object;
	vec3 hit_bary;
	return trace(ray, t, hit_pos, hit_object, hit_bary);
}

bool cast_ray(Ray ray, out vec3 color, out vec3 hit_pos, out vec3 hit_normal)
{
	color = vec3(0.0f);

	float hit_t;
	uint hit_object;
	vec3 hit_bary;
	if (trace(ray, hit_t, hit_pos, hit_object, hit_bary) && hit_t >= 0.0f)
	{
		PhongCoefficients coefficients;
		get_object_properties(hit_object, hit_pos, hit_bary, coefficients, hit_normal);

		vec3 view_dir = -normalize(ray.direction);

		Ray shadow_ray;
        double shadow_t;
		shadow_ray.origin = hit_pos + EPSILON * hit_normal;

		for (uint i = 0; i < lights.length(); i++)
		{
			PointLight light = lights[i];
			
			if (light.intensity < EPSILON) continue;

			shadow_ray.direction = light.position - shadow_ray.origin;

			float light_distance = length(shadow_ray.direction);
			float light_intensity = light.intensity / (light_distance * light_distance);

			shadow_t = INFINITY;
			simple_trace(shadow_ray, shadow_t);

			if (shadow_t < 0.0f || shadow_t > 1.0f) color += phong_lighting(view_dir, hit_normal, coefficients, -shadow_ray.direction / light_distance, light.color, light_intensity);
			else color += coefficients.ambient * light.color * light_intensity;
		}

		color += coefficients.ambient / 15.0f;

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