#pragma once

#include <glm/glm.hpp>

struct alignas(16) Light
{
	alignas(4) int type;
	alignas(16) glm::vec3 position;
	alignas(16) glm::vec3 direction;
	alignas(16) glm::vec3 color;
	alignas(4) float intensity;

	Light() : type(0), position(), direction(), color(1.0f), intensity(0.0f) {}
	Light(int type, glm::vec3 position, glm::vec3 direction, glm::vec3 color, float intensity) : type(type), position(position), direction(direction), color(color), intensity(intensity) {}
};