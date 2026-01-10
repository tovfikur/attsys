<?php

namespace App\Core;

class Router
{
    private $routes = [];

    public function get($path, $handler)
    {
        $this->addRoute('GET', $path, $handler);
    }

    public function post($path, $handler)
    {
        $this->addRoute('POST', $path, $handler);
    }

    private function addRoute($method, $path, $handler, $role = null)
    {
        $this->routes[] = [
            'method' => $method,
            'path' => $path,
            'handler' => $handler,
            'role' => $role
        ];
    }

    public function dispatch($method, $uri)
    {
        foreach ($this->routes as $route) {
            if ($route['method'] === $method && $route['path'] === $uri) {
                // Handler is [Class, Method]
                [$className, $methodName] = $route['handler'];
                // Authorization guard
                if ($route['role']) {
                    \App\Core\Auth::requireRole($route['role']);
                }
                
                $controller = new $className();
                // We could pass params here
                return $controller->$methodName();
            }
        }

        // 404
        http_response_code(404);
        echo json_encode(['error' => 'Not Found']);
    }

    public function getAuth($path, $handler, $role)
    {
        $this->addRoute('GET', $path, $handler, $role);
    }

    public function postAuth($path, $handler, $role)
    {
        $this->addRoute('POST', $path, $handler, $role);
    }
}
