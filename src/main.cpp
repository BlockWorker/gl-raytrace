#define  _USE_MATH_DEFINES
#include <iostream>
#include <vector>
#include <random>
#include <glad/glad.h>
#include <GLFW/glfw3.h>

#define  GLM_FORCE_RADIANS
#include <glm/glm.hpp>
#include <glm/gtc/matrix_transform.hpp>

#include "rendering/Shader.h"
#include "rendering/Texture.h"
#include "rendering/Lights.h"
#include "rendering/SceneObjects.h"
#include "rendering/Model.h"

GLFWwindow* window;
int window_width  = 1024;
int window_height = 768;

const int NUM_LIGHTS = 10;
const int NUM_SPHERES = 10;
const int NUM_TEXTURES = 20;

const float PITCH_LIMIT = M_PI_2 - 1e-3f;
const float MOUSE_SENS = 0.5f;
const float MOVE_SPEED = 3.0f;

static const GLfloat screen_triangles[] = {
    -1.0f, -1.0f, 0.0f,
    1.0f, -1.0f, 0.0f,
    -1.0f, 1.0f, 0.0f,
    -1.0f, 1.0f, 0.0f,
    1.0f, -1.0f, 0.0f,
    1.0f, 1.0f, 0.0f
};


Shader  * shader  = nullptr;
Texture * texture = nullptr;
Texture * nmap = nullptr;
Texture * modelTex = nullptr;

Model * model = nullptr;

glm::vec3 cam_position = glm::vec3(0.0f, 0.0f, 0.0f);
glm::vec3 cam_up = glm::vec3(0.0f, 1.0f, 0.0f);
glm::vec3 cam_u  = glm::vec3(1.0f, 0.0f, 0.0f);
glm::vec3 cam_v  = glm::vec3(0.0f, 1.0f, 0.0f);
glm::vec3 cam_w  = glm::vec3(0.0f, 0.0f, 1.0f);
glm::vec2 cam_rot = glm::vec2(0.0f, 0.0f);

float view_l = -1.0f;
float view_r = 1.0f;
float view_b = -1.0f;
float view_t = 1.0f;
float view_d = 2.0f;

glm::vec3 img_origin;
glm::vec3 img_right;
glm::vec3 img_up;

GLuint vaoID;
GLuint vboID;

glm::vec4 ground_plane;

std::vector<Light> lights;
std::vector<Sphere> spheres;
std::vector<Vertex> vertices;
std::vector<Triangle> triangles;

GLuint buffers[4];

unsigned gen_seed = 0;

void update_camera_direction()
{    
    float sinx = std::sinf(cam_rot.x);
    float cosx = std::cosf(cam_rot.x);
    float siny = std::sinf(cam_rot.y);
    float cosy = std::cosf(cam_rot.y);

    glm::vec3 intermediate(0.0f, -siny, cosy);
    cam_w = glm::normalize(glm::vec3(sinx * intermediate.z, intermediate.y, cosx * intermediate.z));
    
    cam_u = glm::normalize(glm::cross(cam_up, cam_w));
    cam_v = glm::normalize(glm::cross(cam_w, cam_u));
}

void update_camera()
{
    float aspect = (float)window_width / (float)window_height;
    view_l = aspect * view_b;
    view_r = aspect * view_t;

    img_origin = cam_position - (view_d * cam_w) + (view_l * cam_u) + (view_b * cam_v);
    img_right = (view_r - view_l) * cam_u;
    img_up = (view_t - view_b) * cam_v;

    shader->setUniform3fv("cam_pos", cam_position);
    shader->setUniform3fv("img_origin", img_origin);
    shader->setUniform3fv("img_right", img_right);
    shader->setUniform3fv("img_up", img_up);
    shader->setUniform2fv("pixel_size", glm::vec2(1.0f / window_width, 1.0f / window_height));
}

void update_scene()
{
    GLsizeiptr size = lights.size() * sizeof(Light);
    glBindBufferBase(GL_SHADER_STORAGE_BUFFER, 0, buffers[0]);
    glBufferData(GL_SHADER_STORAGE_BUFFER, size, lights.data(), GL_STATIC_DRAW);

    size = spheres.size() * sizeof(Sphere);
    glBindBufferBase(GL_SHADER_STORAGE_BUFFER, 1, buffers[1]);
    glBufferData(GL_SHADER_STORAGE_BUFFER, size, spheres.data(), GL_STATIC_DRAW);

    size = vertices.size() * sizeof(Vertex);
    glBindBufferBase(GL_SHADER_STORAGE_BUFFER, 2, buffers[2]);
    glBufferData(GL_SHADER_STORAGE_BUFFER, size, vertices.data(), GL_STATIC_DRAW);

    size = triangles.size() * sizeof(Triangle);
    glBindBufferBase(GL_SHADER_STORAGE_BUFFER, 3, buffers[3]);
    glBufferData(GL_SHADER_STORAGE_BUFFER, size, triangles.data(), GL_STATIC_DRAW);
}

void make_triangle(unsigned vi1, unsigned vi2, unsigned vi3, const glm::vec3& normal)
{
    Vertex v1 = vertices[vi1];
    Vertex v2 = vertices[vi2];
    Vertex v3 = vertices[vi3];
    glm::mat2 uvtrans(0.0f, 0.0f, 0.0f, 0.0f);
    if (v1.material.normalmap >= 0 && v1.uv != v2.uv && v2.uv != v3.uv && v3.uv != v1.uv)
    {
        glm::vec2 b = v2.uv - v1.uv;
        glm::vec2 c = v3.uv - v1.uv;
        b *= glm::length(v2.position - v1.position) / glm::length(b);
        c *= glm::length(v3.position - v1.position) / glm::length(c);
        float det = b.x * c.y - c.x * b.y;
        uvtrans = glm::mat2(c.y / det, -b.y / det, -c.x / det, b.x / det);
    }
    glm::vec3 center = (v1.position + v2.position + v3.position) / 3.0f;
    float radius = std::max(glm::length(v1.position - center), std::max(glm::length(v2.position - center), glm::length(v3.position - center)));
    triangles.push_back(Triangle(glm::uvec3(vi1, vi2, vi3), normal, uvtrans, glm::vec4(center, radius)));
}

void make_triangle(unsigned vi1, unsigned vi2, unsigned vi3)
{
    Vertex v1 = vertices[vi1];
    Vertex v2 = vertices[vi2];
    Vertex v3 = vertices[vi3];
    glm::vec3 normal = glm::normalize(glm::cross(v2.position - v1.position, v3.position - v1.position));
    make_triangle(vi1, vi2, vi3, normal);
}

void make_triangle(const Vertex& v1, const Vertex& v2, const Vertex& v3, const glm::vec3& normal)
{
    unsigned vertIndex = vertices.size();
    vertices.push_back(v1);
    vertices.push_back(v2);
    vertices.push_back(v3);
    make_triangle(vertIndex, vertIndex + 1, vertIndex + 2, normal);
}

void make_triangle(const Vertex& v1, const Vertex& v2, const Vertex& v3)
{
    unsigned vertIndex = vertices.size();
    vertices.push_back(v1);
    vertices.push_back(v2);
    vertices.push_back(v3);
    glm::vec3 normal = glm::normalize(glm::cross(v2.position - v1.position, v3.position - v1.position));
    make_triangle(vertIndex, vertIndex + 1, vertIndex + 2, normal);
}

void generate_scene()
{
    const float GEN_X_MIN = -3.0f;
    const float GEN_X_MAX = 3.0f;
    const float GEN_Y_MIN = -1.0f;
    const float GEN_Y_MAX = 4.0f;
    const float GEN_Z_MIN = -10.0f;
    const float GEN_Z_MAX = -1.0f;

    std::default_random_engine gen(gen_seed);
    auto randf = std::generate_canonical<float, std::numeric_limits<float>::digits, std::default_random_engine>;
    auto randfr = [=](std::default_random_engine& gen, float min, float max) { return (max - min) * randf(gen) + min; };

    lights.clear();
    spheres.clear();
    vertices.clear();
    triangles.clear();

    /*for (int i = 0; i < NUM_LIGHTS; i++) {
        auto pos = glm::vec3(randfr(gen, GEN_X_MIN, GEN_X_MAX), randfr(gen, GEN_Y_MIN, GEN_Y_MAX), randfr(gen, GEN_Z_MIN, GEN_Z_MAX));
        auto color = glm::vec3(randf(gen), randf(gen), randf(gen));
        //auto lightSphereMat = Material(glm::vec3(0.0f), glm::vec4(0.0f, 0.0f, 0.0f, 1.0f), glm::vec4(0.0f, 0.0f, 0.0f, 1.0f), color, glm::vec3(0.0f), glm::ivec4(-1), -1, 1.0f);
        lights.push_back(Light(0, pos, glm::vec3(0.0f), color, randfr(gen, 0.5f, 1.5f)));
        //spheres.push_back(Sphere(pos, 0.1f, lightSphereMat));
    }*/

    lights.push_back(Light(1, glm::vec3(0.0f), glm::normalize(glm::vec3(-1.0f, -3.0f, 1.0f)), glm::vec3(1.0f, 1.0f, 0.7f), 0.5f));

    auto modelMat = Material(glm::vec3(1.0f), glm::vec4(1.0f), glm::vec4(0.0f, 0.0f, 0.0f, 1.0f), glm::vec3(0.0f), glm::vec3(0.0f), glm::ivec4(2, -1, -1, -1), -1, 1.0f);
    model->compile(vertices, triangles, modelMat, glm::mat4(glm::vec4(1.0f, 0.0f, 0.0f, 0.0f), glm::vec4(0.0f, 1.0f, 0.0f, 0.0f), glm::vec4(0.0f, 0.0f, 1.0f, 0.0f), glm::vec4(0.0f, 0.0f, -5.0f, 1.0f)));

    /*for (int i = 0; i < NUM_SPHERES; i++) {
        auto pos = glm::vec3(randfr(gen, GEN_X_MIN, GEN_X_MAX), randfr(gen, GEN_Y_MIN, GEN_Y_MAX), randfr(gen, GEN_Z_MIN, GEN_Z_MAX));
        auto color = glm::vec4(randf(gen), randf(gen), randf(gen), 0.0f);
        spheres.push_back(Sphere(pos, randfr(gen, 0.1f, 0.7f), Material(color, randfr(gen, 10.0f, 100.0f), 1.0f, -1, -1, 0.8f)));
    }*/

    /*glm::vec3 tnormal = glm::normalize(glm::vec3(0.0f, 0.0f, -1.0f));
    Material tmat1(glm::vec4(1.0f, 0.0f, 0.0f, 1.0f), 40.0f, 0.0f);
    Material tmat2(glm::vec4(0.0f, 1.0f, 0.0f, 1.0f), 40.0f, 0.5f);
    Material tmat3(glm::vec4(0.0f, 0.0f, 1.0f, 1.0f), 40.0f, 1.0f);
    Vertex v1 = Vertex(glm::vec3(0.0f, 0.0f, -5.0f), tnormal, glm::vec2(0, 0), modelMat);
    Vertex v2 = Vertex(glm::vec3(0.0f, 1.0f, -5.0f), tnormal, glm::vec2(0, 0), modelMat);
    Vertex v3 = Vertex(glm::vec3(1.0f, 0.0f, -5.0f), tnormal, glm::vec2(0, 0), modelMat);
    make_triangle(v1, v2, v3, tnormal);*/
}

void key_callback(GLFWwindow* window, int key, int scancode, int action, int mods)
{
    if (action != GLFW_PRESS) return;
    
    if (key == GLFW_KEY_R)
    {
        gen_seed++;
        generate_scene();
        update_scene();
        std::cout << gen_seed << std::endl;
    }
    else if (key == GLFW_KEY_F4 && mods == GLFW_MOD_ALT)
    {
        glfwSetWindowShouldClose(window, GLFW_TRUE);
    }
}

void window_size_callback(GLFWwindow* window, int width, int height)
{
    glViewport(0, 0, width, height);
    window_width = width;
    window_height = height;
}

int init()
{
    /* Initialize the library */
    if (!glfwInit())
        return -1;

    /* Create a windowed mode window and its OpenGL context */
    glfwWindowHint(GLFW_CONTEXT_VERSION_MAJOR, 4);
    glfwWindowHint(GLFW_CONTEXT_VERSION_MINOR, 3);
    glfwWindowHint(GLFW_OPENGL_FORWARD_COMPAT, GL_TRUE);
    glfwWindowHint(GLFW_OPENGL_PROFILE, GLFW_OPENGL_CORE_PROFILE);
    glfwWindowHint(GLFW_SAMPLES, 2);

    window = glfwCreateWindow(window_width, window_height, "Raytracing", nullptr, nullptr);

    if (!window)
    {
        glfwTerminate();
        return -1;
    }

    /* Make the window's context current */
    glfwMakeContextCurrent(window);

    glfwSetInputMode(window, GLFW_CURSOR, GLFW_CURSOR_DISABLED);

    glfwSetWindowSizeCallback(window, window_size_callback);
    glfwSetKeyCallback(window, key_callback);

    /* Initialize glad */
    if (!gladLoadGLLoader((GLADloadproc)glfwGetProcAddress))
    {
        std::cout << "Failed to initialize GLAD" << std::endl;
        return -1;
    }

    /* Set the viewport */
    glClearColor(0.6784f, 0.8f, 1.0f, 1.0f);
    glViewport(0, 0, window_width, window_height);

    glEnable(GL_DEPTH_TEST);
    glEnable(GL_MULTISAMPLE);

    return true;
}

int loadContent()
{
    /* Create and apply basic shader */
    shader = new Shader("Basic.vert", "Raytrace.frag");
    GLuint program = shader->get_program_id();
    shader->apply();

    for (int i = 0; i < NUM_TEXTURES; i++)
    {
        shader->setUniform1i("textures[" + std::to_string(i) + "]", i);
    }

    glGenBuffers(4, buffers);

    model = new Model("res/models/growth chamber.obj");
    
    update_camera_direction();
    update_camera();

    ground_plane = glm::vec4(0.0f, 1.0f, 0.0f, -1.0f);
    shader->setUniform4fv("ground_plane", ground_plane);

    generate_scene();
    update_scene();

    glGenVertexArrays(1, &vaoID);
    glBindVertexArray(vaoID);

    glGenBuffers(1, &vboID);
    glBindBuffer(GL_ARRAY_BUFFER, vboID);
    glBufferData(GL_ARRAY_BUFFER, sizeof(screen_triangles), screen_triangles, GL_STATIC_DRAW);

    texture = new Texture();
    texture->load("res/textures/checker.png");
    texture->bind(0);
    nmap = new Texture();
    nmap->load("res/textures/normalnoise.png");
    nmap->bind(1);
    modelTex = new Texture();
    modelTex->load("res/models/growth chamber.png");
    modelTex->bind(2);

    /*glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST);*/

    return true;
}

void render(float time, float deltaTime)
{
    static float accumulatedDelta = 0.0f;
    static int accumulatedFrames = 0;

    accumulatedDelta += deltaTime;
    accumulatedFrames++;
    if (accumulatedDelta > .5f) {
        std::cout << "Avg FPS: " << accumulatedFrames / accumulatedDelta << std::endl;
        accumulatedDelta = 0.0f;
        accumulatedFrames = 0;
    }

    glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);

    double cursorX, cursorY;
    static double lastX, lastY;
    static bool cursorInit = false;
    glfwGetCursorPos(window, &cursorX, &cursorY);
    if (cursorInit)
    {
        cam_rot.x -= (cursorX - lastX) * MOUSE_SENS * deltaTime;
        cam_rot.y -= (cursorY - lastY) * MOUSE_SENS * deltaTime;
    }
    cursorInit = true;
    lastX = cursorX;
    lastY = cursorY;
    if (cam_rot.y < -PITCH_LIMIT) cam_rot.y = -PITCH_LIMIT;
    else if (cam_rot.y > PITCH_LIMIT) cam_rot.y = PITCH_LIMIT;

    update_camera_direction();

    glm::vec3 moveDir(0.0f, 0.0f, 0.0f);
    bool moved = false;

    if (glfwGetKey(window, GLFW_KEY_W))
    {
        moveDir -= cam_w;
        moved = true;
    }
    else if (glfwGetKey(window, GLFW_KEY_S))
    {
        moveDir += cam_w;
        moved = true;
    }
    if (glfwGetKey(window, GLFW_KEY_A))
    {
        moveDir -= cam_u;
        moved = true;
    }
    else if (glfwGetKey(window, GLFW_KEY_D))
    {
        moveDir += cam_u;
        moved = true;
    }
    if (glfwGetKey(window, GLFW_KEY_LEFT_SHIFT))
    {
        moveDir -= cam_up;
        moved = true;
    }
    else if (glfwGetKey(window, GLFW_KEY_SPACE))
    {
        moveDir += cam_up;
        moved = true;
    }

    if (moved) cam_position += MOVE_SPEED * deltaTime * glm::normalize(moveDir);

    update_camera();

    texture->bind(0);
    nmap->bind(1);
    modelTex->bind(2);

    glEnableVertexAttribArray(0);
    glBindBuffer(GL_ARRAY_BUFFER, vboID);
    glVertexAttribPointer(0, 3, GL_FLOAT, GL_FALSE, 0, (void*)0);
    glDrawArrays(GL_TRIANGLES, 0, 6);
    glDisableVertexAttribArray(0);
}

void update()
{
    float startTime = static_cast<float>(glfwGetTime());
    float newTime  = 0.0f;
    float lastTime = startTime;
    float gameTime = 0.0f;
    float deltaTime = 0.0f;

    /* Loop until the user closes the window */
    while (!glfwWindowShouldClose(window))
    {
        /* Update game time value */
        newTime  = static_cast<float>(glfwGetTime());
        gameTime = newTime - startTime;
        deltaTime = newTime - lastTime;
        lastTime = newTime;

        /* Render here */
        render(gameTime, deltaTime);

        /* Swap front and back buffers */
        glfwSwapBuffers(window);

        /* Poll for and process events */
        glfwPollEvents();
    }
}

int main(void)
{
    if (!init())
        return -1;

    if (!loadContent())
        return -1;

    update();

    glfwTerminate();

    delete shader;
    delete texture;
    delete nmap;
    delete modelTex;
    delete model;

    return 0;
}