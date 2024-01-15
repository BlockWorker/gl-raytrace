#pragma once

#include <glad/glad.h>
#include <glm/glm.hpp>

struct alignas(16) Material
{
	alignas(16) glm::vec3 ambient;
	alignas(16) glm::vec4 diffuse;
	alignas(16) glm::vec4 specular;
	alignas(16) glm::vec3 emissive;
	alignas(16) glm::vec3 reflective;
	alignas(16) glm::ivec4 textures;
	alignas(4) int normalmap;
	alignas(4) float eta;

	Material() : ambient(), diffuse(), specular(), emissive(), reflective(), textures(-1), normalmap(-1), eta(1.0f) {}
	Material(glm::vec4 color, float specular_n, float reflectivity) : ambient(color), diffuse(color), specular(1.0f, 1.0f, 1.0f, specular_n), emissive(), reflective(reflectivity), textures(-1), normalmap(-1), eta(1.0f) {}
	Material(glm::vec4 color, float specular_n, float reflectivity, GLint texture, GLint normalmap, float eta) : ambient(color), diffuse(color), specular(1.0f, 1.0f, 1.0f, specular_n), emissive(), reflective(reflectivity), textures(texture, -1, -1, -1), normalmap(normalmap), eta(eta) {}
	Material(glm::vec3 ambient, glm::vec4 diffuse, glm::vec4 specular, glm::vec3 emissive, glm::vec3 reflective, glm::ivec4 textures, GLint normalmap, float eta) : ambient(ambient), diffuse(diffuse), specular(specular), emissive(emissive), reflective(reflective), textures(textures), normalmap(normalmap), eta(eta) {}
};

struct alignas(16) Sphere
{
	alignas(16) glm::vec4 definition;
	alignas(16) Material material;

	Sphere() : definition(), material() {}
	Sphere(glm::vec3 position, float radius, Material material) : definition(position, radius), material(material) {}
};

struct alignas(16) Vertex
{
	alignas(16) glm::vec3 position;
	alignas(16) glm::vec3 normal;
	alignas(8) glm::vec2 uv;
	alignas(16) Material material;

	Vertex() : position(), normal(), uv(), material() {}
	Vertex(glm::vec3 position, glm::vec3 normal, Material material) : position(position), normal(normal), uv(), material(material) {}
	Vertex(glm::vec3 position, glm::vec3 normal, glm::vec2 uv, Material material) : position(position), normal(normal), uv(uv), material(material) {}
};

struct alignas(16) Triangle
{
	alignas(16) glm::uvec3 indices;
	alignas(16) glm::vec3 normal;
	alignas(16) glm::mat2 uvtrans;
	alignas(16) glm::vec4 enc_sphere;

	Triangle() : indices(), normal(), uvtrans(), enc_sphere() {}
	Triangle(glm::uvec3 indices, glm::vec3 normal, glm::mat2 uvtrans, glm::vec4 enc_sphere) : indices(indices), normal(normal), uvtrans(uvtrans), enc_sphere(enc_sphere) {}
};