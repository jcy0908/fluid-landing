#!/bin/sh
# fluid.wasm을 만든다. Emscripten이 필요 없다 — clang과 wasm-ld면 된다.
#
#   sh cpp/wasm/build.sh
#
# 결과는 js/fluid.wasm 하나이며, 그대로 커밋한다. 이 저장소에는 빌드 단계가
# 없고 GitHub Pages가 파일을 그대로 서빙하기 때문이다.
set -eu

root=$(cd "$(dirname "$0")/../.." && pwd)
out="$root/js/fluid.wasm"

clang++ \
  --target=wasm32 \
  -O3 \
  -std=c++17 \
  -nostdlib \
  -ffreestanding \
  -fno-exceptions \
  -fno-rtti \
  -DFLUID_FREESTANDING \
  -I "$root/cpp/include" \
  -Wl,--no-entry \
  -Wl,--strip-all \
  -Wl,--export=fluid_scratch \
  -Wl,--export=fluid_scratch_size \
  -Wl,--export=fluid_spring_step \
  -Wl,--export=fluid_project \
  -Wl,--export=fluid_rubberband \
  -Wl,--export=fluid_nearest_snap \
  -Wl,--export=fluid_tracker_reset \
  -Wl,--export=fluid_tracker_add \
  -Wl,--export=fluid_tracker_velocity \
  -o "$out" \
  "$root/cpp/wasm/fluid_wasm.cpp"

echo "만들었습니다: js/fluid.wasm ($(wc -c < "$out")바이트)"
