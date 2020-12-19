#pragma once

#include <glm/glm.hpp>

struct alignas(16) PointLight
{
	alignas(16) glm::vec3 position;
	alignas(16) glm::vec3 color;
	alignas(4) float intensity;

	PointLight() : position(), color(1.0f), intensity(0.0f) {}
	PointLight(glm::vec3 position, glm::vec3 color, float intensity) : position(position), color(color), intensity(intensity) {}
};