#pragma once

#include <string>
#include <vector>
#include <glm/glm.hpp>
#include <rendering/SceneObjects.h>

class Model
{
public:
	Model() : vertexPos(), vertexNormals(), vertexUV(), trianglesPos(), trianglesNormals(), trianglesUV() {}
	Model(const std::string& filename) : Model()
	{
		load(filename);
	}

	void load(const std::string& filename);
	void compile(std::vector<Vertex>& vertices, std::vector<Triangle>& triangles, const Material& material) const;
	void compile(std::vector<Vertex>& vertices, std::vector<Triangle>& triangles, const Material& material, const glm::mat4& transform) const;
private:
	std::vector<glm::vec3> vertexPos;
	std::vector<glm::vec3> vertexNormals;
	std::vector<glm::vec2> vertexUV;
	std::vector<glm::ivec3> trianglesPos;
	std::vector<glm::ivec3> trianglesNormals;
	std::vector<glm::ivec3> trianglesUV;
};

