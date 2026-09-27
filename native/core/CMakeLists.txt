cmake_minimum_required(VERSION 3.13)
project(resqr_core CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_library(resqr_core STATIC resqr.cpp)
target_include_directories(resqr_core PUBLIC ${CMAKE_CURRENT_SOURCE_DIR})

add_executable(resqr_core_test test.cpp)
target_link_libraries(resqr_core_test resqr_core)
