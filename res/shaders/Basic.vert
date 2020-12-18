#version 430

layout(location = 0) in vec3 position;
	
out vec3 pixel_position;

void main()
{
    pixel_position = vec3((position.x + 1.0f) / 2.0f, (position.y + 1.0f) / 2.0f, 0.0f);
	gl_Position = vec4(position, 1.0f);
}