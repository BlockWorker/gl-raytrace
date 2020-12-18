#pragma once

#include <glm/glm.hpp>

struct PointLight
{
	glm::vec3 position;
	glm::vec3 color;
	float intensity;

	PointLight() : position(), color(1.0f), intensity(0.0f) {}
	PointLight(glm::vec3 position, glm::vec3 color, float intensity) : position(position), color(color), intensity(intensity) {}
};