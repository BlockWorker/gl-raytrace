#pragma once

#include <glm/glm.hpp>

struct Sphere
{
	glm::vec3 position;
	float radius;

	glm::vec3 ambient;
	glm::vec3 diffuse;
	glm::vec4 specular;

	Sphere() : position(), radius(0.0f), ambient(), diffuse(), specular() {}
	Sphere(glm::vec3 position, float radius, glm::vec3 color, float specular_n) : position(position), radius(radius), ambient(color), diffuse(color), specular(glm::vec4(1.0f, 1.0f, 1.0f, specular_n)) {}
	Sphere(glm::vec3 position, float radius, glm::vec3 ambient, glm::vec3 diffuse, glm::vec4 specular) : position(position), radius(radius), ambient(ambient), diffuse(diffuse), specular(specular) {}
};