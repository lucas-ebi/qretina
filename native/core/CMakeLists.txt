cmake_minimum_required(VERSION 3.13)
project(qretina_core CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_library(qretina_core STATIC qretina.cpp)
target_include_directories(qretina_core PUBLIC ${CMAKE_CURRENT_SOURCE_DIR})

add_executable(qretina_core_test test.cpp)
target_link_libraries(qretina_core_test qretina_core)
