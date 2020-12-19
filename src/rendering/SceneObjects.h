#pragma once

#include <glm/glm.hpp>

struct alignas(16) PhongCoefficients
{
	alignas(16) glm::vec3 ambient;
	alignas(16) glm::vec3 diffuse;
	alignas(16) glm::vec4 specular;

	PhongCoefficients() : ambient(), diffuse(), specular() {}
	PhongCoefficients(glm::vec3 color, float specular_n) : ambient(color), diffuse(color), specular(1.0f, 1.0f, 1.0f, specular_n) {}
	PhongCoefficients(glm::vec3 ambient, glm::vec3 diffuse, glm::vec4 specular) : ambient(ambient), diffuse(diffuse), specular(specular) {}
};

struct alignas(16) Sphere
{
	alignas(16) glm::vec4 definition;
	alignas(16) PhongCoefficients coefficients;

	Sphere() : definition(), coefficients() {}
	Sphere(glm::vec3 position, float radius, PhongCoefficients coefficients) : definition(position, radius), coefficients(coefficients) {}
};

struct alignas(16) Vertex
{
	alignas(16) glm::vec3 position;
	alignas(16) glm::vec3 normal;
	alignas(8) glm::vec2 uv;
	alignas(16) PhongCoefficients coefficients;

	Vertex() : position(), normal(), uv(), coefficients() {}
	Vertex(glm::vec3 position, glm::vec3 normal, PhongCoefficients coefficients) : position(position), normal(normal), uv(), coefficients(coefficients) {}
	Vertex(glm::vec3 position, glm::vec3 normal, glm::vec2 uv, PhongCoefficients coefficients) : position(position), normal(normal), uv(uv), coefficients(coefficients) {}
};

struct alignas(16) Triangle
{
	alignas(16) glm::uvec3 indices;
	alignas(16) glm::vec3 normal;

	Triangle() : indices(), normal() {}
	Triangle(unsigned i1, unsigned i2, unsigned i3, glm::vec3 normal) : indices(i1, i2, i3), normal(normal) {}
	Triangle(glm::uvec3 indices, glm::vec3 normal) : indices(indices), normal(normal) {}
};