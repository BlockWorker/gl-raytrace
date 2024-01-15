#include "Model.h"

#include <regex>
#include <fstream>
#include <map>
#include <helpers/RootDir.h>

const std::regex v_regex = std::regex(R"(^v\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?).*)");
const std::regex vn_regex = std::regex(R"(^vn\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?).*)");
const std::regex vt_regex = std::regex(R"(^vt\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?).*)");
const std::regex f_regex = std::regex(R"(^f\s+(\d+)(?:\/(\d+)?)?(?:\/(\d+))?\s+(\d+)(?:\/(\d+)?)?(?:\/(\d+))?\s+(\d+)(?:\/(\d+)?)?(?:\/(\d+))?.*)");

void Model::load(const std::string& filename)
{
	vertexPos.clear();
	vertexNormals.clear();
	vertexUV.clear();
	trianglesPos.clear();
	trianglesNormals.clear();
	trianglesUV.clear();
	
	std::ifstream file(ROOT_DIR + filename);
	if (!file.is_open()) return;

	std::string line;
	std::smatch match;
	while (std::getline(file, line))
	{
		if (std::regex_match(line, match, v_regex))
		{
			vertexPos.push_back(glm::vec3(std::stof(match[1]), std::stof(match[2]), std::stof(match[3])));
		}
		else if (std::regex_match(line, match, vn_regex))
		{
			vertexNormals.push_back(glm::vec3(std::stof(match[1]), std::stof(match[2]), std::stof(match[3])));
		}
		else if (std::regex_match(line, match, vt_regex))
		{
			vertexUV.push_back(glm::vec2(std::stof(match[1]), 1.0f - std::stof(match[2])));
		}
		else if (std::regex_match(line, match, f_regex))
		{
			trianglesPos.push_back(glm::ivec3(std::stoi(match[1]) - 1, std::stoi(match[4]) - 1, std::stoi(match[7]) - 1));
			if (match[2].matched) trianglesUV.push_back(glm::ivec3(std::stoi(match[2]) - 1, std::stoi(match[5]) - 1, std::stoi(match[8]) - 1));
			else trianglesUV.push_back(glm::ivec3(-1));
			if (match[3].matched) trianglesNormals.push_back(glm::ivec3(std::stoi(match[3]) - 1, std::stoi(match[6]) - 1, std::stoi(match[9]) - 1));
			else trianglesNormals.push_back(glm::ivec3(-1));
		}
	}

	file.close();
}

void Model::compile(std::vector<Vertex>& vertices, std::vector<Triangle>& triangles, const Material& material) const
{
	compile(vertices, triangles, material, glm::mat4(1.0f));
}

bool vecLess(glm::ivec3 const& v1, glm::ivec3 const& v2)
{
	if (v1.x != v2.x) return v1.x < v2.x;
	if (v1.y != v2.y) return v1.y < v2.y;
	return v1.z < v2.z;
}

void Model::compile(std::vector<Vertex>& vertices, std::vector<Triangle>& triangles, const Material& material, const glm::mat4& transform) const
{
	if (trianglesPos.size() == 0) return;
	auto triangleReuseIndices = std::map<glm::ivec3, unsigned, bool(*)(glm::ivec3 const&, glm::ivec3 const&)>(vecLess);
	auto normalTransform = glm::transpose(glm::inverse(transform));
	unsigned vertexIndex = vertices.size();
	for (int i = 0; i < trianglesPos.size(); i++)
	{
		auto pos = trianglesPos[i];
		auto norm = trianglesNormals[i];
		auto uv = trianglesUV[i];

		glm::bvec3 reuse(false);
		glm::uvec3 indices(0);
		glm::vec3 pos1, pos2, pos3;
		glm::vec3 norm1, norm2, norm3;
		glm::vec2 uv1, uv2, uv3;
		glm::mat2 uvtrans(0.0f, 0.0f, 0.0f, 0.0f);
		bool allowReuse = false;

		auto key1 = glm::ivec3(pos.x, norm.x, uv.x);
		if (triangleReuseIndices.count(key1) > 0)
		{
			indices.x = triangleReuseIndices[key1];
			reuse.x = true;
		}
		else indices.x = vertexIndex++;

		auto key2 = glm::ivec3(pos.y, norm.y, uv.y);
		if (triangleReuseIndices.count(key2) > 0)
		{
			indices.y = triangleReuseIndices[key2];
			reuse.y = true;
		}
		else indices.y = vertexIndex++;

		auto key3 = glm::ivec3(pos.z, norm.z, uv.z);
		if (triangleReuseIndices.count(key3) > 0)
		{
			indices.z = triangleReuseIndices[key3];
			reuse.z = true;
		}
		else indices.z = vertexIndex++;

		if (reuse.x) pos1 = vertices[indices.x].position;
		else pos1 = glm::vec3(transform * glm::vec4(vertexPos[pos.x], 1.0f));
		if (reuse.y) pos2 = vertices[indices.y].position;
		else pos2 = glm::vec3(transform * glm::vec4(vertexPos[pos.y], 1.0f));
		if (reuse.z) pos3 = vertices[indices.z].position;
		else pos3 = glm::vec3(transform * glm::vec4(vertexPos[pos.z], 1.0f));

		auto tri_normal = glm::normalize(glm::cross(pos2 - pos1, pos3 - pos1));
		if (norm.x >= 0 && norm.y >= 0 && norm.z >= 0)
		{
			if (!reuse.x) norm1 = glm::normalize(glm::vec3(normalTransform * glm::vec4(vertexNormals[norm.x], 0.0f)));
			if (!reuse.y) norm2 = glm::normalize(glm::vec3(normalTransform * glm::vec4(vertexNormals[norm.y], 0.0f)));
			if (!reuse.z) norm3 = glm::normalize(glm::vec3(normalTransform * glm::vec4(vertexNormals[norm.z], 0.0f)));
			allowReuse = true;
		}
		else norm1 = norm2 = norm3 = tri_normal;

		if (uv.x >= 0 && uv.y >= 0 && uv.z >= 0)
		{
			if (reuse.x) uv1 = vertices[indices.x].uv;
			else uv1 = vertexUV[uv.x];
			if (reuse.y) uv2 = vertices[indices.y].uv;
			else uv2 = vertexUV[uv.y];
			if (reuse.z) uv3 = vertices[indices.z].uv;
			else uv3 = vertexUV[uv.z];

			if (material.normalmap >= 0 && uv1 != uv2 && uv2 != uv3 && uv3 != uv1)
			{
				glm::vec2 b = uv2 - uv1;
				glm::vec2 c = uv3 - uv1;
				b *= glm::length(pos2 - pos1) / glm::length(b);
				c *= glm::length(pos3 - pos1) / glm::length(c);
				float det = b.x * c.y - c.x * b.y;
				uvtrans = glm::mat2(c.y / det, -b.y / det, -c.x / det, b.x / det);
			}
		}
		else uv1 = uv2 = uv3 = glm::vec2(0.0f);

		if (!reuse.x)
		{
			vertices.push_back(Vertex(pos1, norm1, uv1, material));
			if (allowReuse) triangleReuseIndices[key1] = indices.x;
		}
		if (!reuse.y)
		{
			vertices.push_back(Vertex(pos2, norm2, uv2, material));
			if (allowReuse) triangleReuseIndices[key2] = indices.y;
		}
		if (!reuse.z)
		{
			vertices.push_back(Vertex(pos3, norm3, uv3, material));
			if (allowReuse) triangleReuseIndices[key3] = indices.z;
		}

		glm::vec3 center = (pos1 + pos2 + pos3) / 3.0f;
		float radius = std::max(glm::length(pos1 - center), std::max(glm::length(pos2 - center), glm::length(pos3 - center)));

		triangles.push_back(Triangle(indices, tri_normal, uvtrans, glm::vec4(center, radius)));
	}
}
