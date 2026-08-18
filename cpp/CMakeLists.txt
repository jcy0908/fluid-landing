# fluid — js/fluid.js의 물리를 C++로 옮긴 헤더 온리 라이브러리
#
#   cmake -B build && cmake --build build && ctest --test-dir build --output-on-failure
#
# 외부 의존성이 없다. 테스트 프레임워크도 쓰지 않는다.

cmake_minimum_required(VERSION 3.16)
project(fluid LANGUAGES CXX VERSION 1.0.0)

add_library(fluid INTERFACE)
target_include_directories(fluid INTERFACE
    $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>)
target_compile_features(fluid INTERFACE cxx_std_17)

option(FLUID_BUILD_TESTS "동등성 테스트를 빌드한다" ON)
option(FLUID_BUILD_EXAMPLES "예제를 빌드한다" ON)

if(FLUID_BUILD_TESTS)
    enable_testing()
    add_executable(test_fluid tests/test_fluid.cpp)
    target_link_libraries(test_fluid PRIVATE fluid)
    target_include_directories(test_fluid PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/tests)
    target_compile_options(test_fluid PRIVATE -Wall -Wextra)
    add_test(NAME equivalence COMMAND test_fluid)
endif()

if(FLUID_BUILD_EXAMPLES)
    add_executable(throw_example examples/throw.cpp)
    target_link_libraries(throw_example PRIVATE fluid)
    target_compile_options(throw_example PRIVATE -Wall -Wextra)
endif()
